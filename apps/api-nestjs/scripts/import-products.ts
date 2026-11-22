import 'dotenv/config';
import { existsSync, realpathSync, writeFileSync } from 'fs';
import { relative, resolve } from 'path';
import { stringify } from 'csv-stringify/sync';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsImportParser } from '../src/imports/products-import.parser';
import { ProductsImportService } from '../src/imports/products-import.service';
import { ProductImportRowError } from '../src/imports/products-import.types';

type ImportMode = 'dry-run' | 'import';

interface CliOptions {
  file?: string;
  mode?: ImportMode;
  batchSize: number;
  errorsFile?: string;
  help: boolean;
}

function printHelp(): void {
  console.log(`
Bulk product CSV importer

npm usage:
  npm run data:import:dry-run -- <csv-path>
  npm run data:import -- <csv-path>

Direct usage:
  ts-node scripts/import-products.ts --file <csv-path> --dry-run
  ts-node scripts/import-products.ts --file <csv-path> --apply

Options:
  --file <path>          CSV file to import
  --dry-run              Validate and show planned changes without writing
  --apply                Validate and write the import
  --batch-size <number>  Products per transaction (default: 100)
  --errors-file <path>   Write validation errors to a CSV file
  --help                 Show this help

Environment variables:
  IMPORT_BATCH_SIZE      Same as --batch-size
  IMPORT_ERRORS_FILE     Same as --errors-file

Safety:
  Apply mode replaces stockOnHand with absolute CSV values.
  Run imports while stock cannot change. A restart replays every batch.
`);
}

function parseBatchSize(raw: string | undefined): number {
  if (!raw) return 100;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 5000) {
    throw new Error('batch size must be an integer between 1 and 5000');
  }
  return value;
}

function parseArguments(args: string[]): CliOptions {
  const options: CliOptions = {
    batchSize: parseBatchSize(process.env.IMPORT_BATCH_SIZE),
    errorsFile: process.env.IMPORT_ERRORS_FILE,
    help: false,
  };
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const equalsIndex = argument.indexOf('=');
    const name = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    const inlineValue =
      equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : undefined;

    const takeValue = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${name} requires a value`);
      }
      index += 1;
      return value;
    };

    switch (name) {
      case '--file':
        options.file = takeValue();
        break;
      case '--dry-run':
        if (options.mode === 'import') {
          throw new Error('choose only one of --dry-run or --apply');
        }
        options.mode = 'dry-run';
        break;
      case '--apply':
        if (options.mode === 'dry-run') {
          throw new Error('choose only one of --dry-run or --apply');
        }
        options.mode = 'import';
        break;
      case '--batch-size':
        options.batchSize = parseBatchSize(takeValue());
        break;
      case '--errors-file':
        options.errorsFile = takeValue();
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (argument.startsWith('--')) {
          throw new Error(`Unknown option: ${argument}`);
        }
        positionals.push(argument);
    }
  }

  if (!options.file && positionals[0]) {
    options.file = positionals.shift();
  }
  if (positionals[0] === 'dry-run' || positionals[0] === 'apply') {
    const positionalMode =
      positionals.shift() === 'apply' ? 'import' : 'dry-run';
    if (options.mode && options.mode !== positionalMode) {
      throw new Error('choose only one import mode');
    }
    options.mode = positionalMode;
  }
  if (positionals.length > 0) {
    throw new Error(`Unexpected argument: ${positionals[0]}`);
  }

  return options;
}

function safeSpreadsheetCell(
  value: string | number | undefined,
): string | number {
  if (value === undefined) return '';
  if (typeof value === 'number') return value;
  const sanitized = value.replace(/\0/g, '');
  if (/^[=+\-@]/.test(sanitized)) return `'${sanitized}`;
  return sanitized;
}

function writeValidationErrorsFile(
  filePath: string,
  errors: ProductImportRowError[],
): void {
  const rows = errors.map((error) => ({
    rowNumber: error.rowNumber,
    sku: safeSpreadsheetCell(error.sku),
    field: safeSpreadsheetCell(error.field),
    error: safeSpreadsheetCell(error.message),
  }));
  const csv = stringify(rows, {
    header: true,
    columns: ['rowNumber', 'sku', 'field', 'error'],
  });
  writeFileSync(filePath, csv, 'utf8');
}

function printSummary(summary: {
  mode: ImportMode;
  rowsRead: number;
  validRows: number;
  rejectedRows: number;
  productsInserted: number;
  productsUpdated: number;
  inventoryInserted: number;
  inventoryUpdated: number;
}): void {
  const dryRun = summary.mode === 'dry-run';
  console.log('');
  console.log(dryRun ? 'Dry-run summary' : 'Import summary');
  console.log(`Rows read:             ${summary.rowsRead}`);
  console.log(`Valid rows:            ${summary.validRows}`);
  console.log(`Rejected rows:         ${summary.rejectedRows}`);
  console.log(
    `${dryRun ? 'Products to insert' : 'Products inserted'}:   ${summary.productsInserted}`,
  );
  console.log(
    `${dryRun ? 'Products to update' : 'Products updated'}:   ${summary.productsUpdated}`,
  );
  console.log(
    `${dryRun ? 'Inventory to insert' : 'Inventory inserted'}: ${summary.inventoryInserted}`,
  );
  console.log(
    `${dryRun ? 'Inventory to update' : 'Inventory updated'}: ${summary.inventoryUpdated}`,
  );
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.file) {
    throw new Error('A CSV file is required. Use --help for usage.');
  }
  if (!options.mode) {
    throw new Error(
      'Choose an import mode with --dry-run or --apply. Use --help for usage.',
    );
  }

  const filePath = resolve(options.file);
  if (!existsSync(filePath)) {
    throw new Error(`CSV file does not exist: ${filePath}`);
  }

  const errorsPath = options.errorsFile
    ? resolve(options.errorsFile)
    : undefined;
  if (errorsPath) {
    const sourcePath = realpathSync(filePath);
    const targetPath = existsSync(errorsPath)
      ? realpathSync(errorsPath)
      : errorsPath;
    if (relative(sourcePath, targetPath) === '') {
      throw new Error(
        'The validation errors file must be different from the CSV input file.',
      );
    }
    writeValidationErrorsFile(errorsPath, []);
  }

  const parser = new ProductsImportParser();
  const parsed = await parser.parse(filePath);
  if (options.mode === 'import') {
    console.warn(
      'Apply mode replaces stockOnHand with absolute CSV values. Run it during a maintenance window when stock cannot change.',
    );
  }
  const prisma = new PrismaService();

  try {
    const service = new ProductsImportService(prisma);
    const result = await service.run(parsed, {
      dryRun: options.mode === 'dry-run',
      batchSize: options.batchSize,
    });

    printSummary(result.summary);

    if (result.errors.length > 0) {
      console.error('');
      console.error(
        `Import rejected: ${result.errors.length} validation error(s)`,
      );
      for (const error of result.errors.slice(0, 100)) {
        console.error(
          `Row ${error.rowNumber}${error.field ? ` [${error.field}]` : ''}: ${error.message}`,
        );
      }
      if (result.errors.length > 100) {
        console.error(`... ${result.errors.length - 100} more error(s)`);
      }

      if (errorsPath) {
        writeValidationErrorsFile(errorsPath, result.errors);
        console.error(`Validation errors written to: ${errorsPath}`);
      }
      console.error('No database data was written.');
      process.exitCode = 1;
      return;
    }

    if (options.mode === 'dry-run') {
      console.log('');
      console.log('Dry run complete. No database data was written.');
    } else {
      console.log('');
      console.log('Import complete.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Import failed: ${message}`);
  process.exitCode = 1;
});
