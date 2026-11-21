import React, { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Product, CreateProductRequest, UpdateProductRequest } from '@/api/types'
import { useCreateProduct, useUpdateProduct } from '@/api/queries'
import { parseIdr, formatIdr } from '@/lib/formatters'

const productSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(50),
  barcode: z.string().max(64).optional(),
  name: z.string().min(1, 'Product name is required').max(150),
  basePriceStr: z.string().min(1, 'Base price is required'),
  costPriceStr: z.string().optional(),
  isActive: z.boolean().default(true),
})

type ProductFormValues = z.infer<typeof productSchema>

interface ProductModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
}

export const ProductModal: React.FC<ProductModalProps> = ({
  open,
  onOpenChange,
  product,
}) => {
  const isEditing = !!product
  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: '',
      barcode: '',
      name: '',
      basePriceStr: '',
      costPriceStr: '',
      isActive: true,
    },
  })

  useEffect(() => {
    if (product) {
      reset({
        sku: product.sku,
        barcode: product.barcode || '',
        name: product.name,
        basePriceStr: product.basePrice.toString(),
        costPriceStr: product.costPrice ? product.costPrice.toString() : '0',
        isActive: product.isActive,
      })
    } else {
      reset({
        sku: '',
        barcode: '',
        name: '',
        basePriceStr: '',
        costPriceStr: '0',
        isActive: true,
      })
    }
  }, [product, reset])

  const onSubmit = async (values: ProductFormValues) => {
    const basePrice = parseIdr(values.basePriceStr)
    const costPrice = values.costPriceStr ? parseIdr(values.costPriceStr) : 0

    if (isEditing && product) {
      const payload: UpdateProductRequest & { id: string } = {
        id: product.id,
        sku: values.sku.trim(),
        barcode: values.barcode?.trim() || null,
        name: values.name.trim(),
        basePrice,
        costPrice,
        isActive: values.isActive,
      }
      await updateMutation.mutateAsync(payload)
    } else {
      const payload: CreateProductRequest = {
        sku: values.sku.trim(),
        barcode: values.barcode?.trim() || undefined,
        name: values.name.trim(),
        basePrice,
        costPrice,
      }
      await createMutation.mutateAsync(payload)
    }

    onOpenChange(false)
  }

  const basePriceValue = watch('basePriceStr')
  const costPriceValue = watch('costPriceStr')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Master Product' : 'Add New Master Product'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update catalog specifications across all branches.'
              : 'Register a new master catalog item. Stock is initialized to 0 across all stores.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                SKU Code *
              </label>
              <Input
                placeholder="e.g. KOPI-001"
                error={errors.sku?.message}
                {...register('sku')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Barcode (Optional)
              </label>
              <Input
                placeholder="e.g. 8991234567890"
                error={errors.barcode?.message}
                {...register('barcode')}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Product Name *
            </label>
            <Input
              placeholder="e.g. Kopi Susu Gula Aren"
              error={errors.name?.message}
              {...register('name')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Base Selling Price (IDR) *
              </label>
              <Input
                type="number"
                placeholder="18000"
                error={errors.basePriceStr?.message}
                {...register('basePriceStr')}
              />
              {basePriceValue && !isNaN(parseInt(basePriceValue)) && (
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Preview: {formatIdr(parseIdr(basePriceValue))}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cost Price (IDR)
              </label>
              <Input
                type="number"
                placeholder="9000"
                error={errors.costPriceStr?.message}
                {...register('costPriceStr')}
              />
              {costPriceValue && !isNaN(parseInt(costPriceValue)) && (
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Preview: {formatIdr(parseIdr(costPriceValue))}
                </span>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="flex items-center gap-2 pt-1">
              <input
                id="isActive"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                checked={watch('isActive')}
                onChange={(e) => setValue('isActive', e.target.checked)}
              />
              <label
                htmlFor="isActive"
                className="text-xs font-medium text-slate-700"
              >
                Product is active (available for sales & inventory)
              </label>
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
            >
              {isSubmitting
                ? 'Saving...'
                : isEditing
                ? 'Update Product'
                : 'Create Product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
