import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/platform/web_app_shell.dart';

void main() {
  testWidgets('wide browser presents a 412dp phone canvas', (tester) async {
    tester.view.physicalSize = const Size(1440, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    late Size observedSize;
    await tester.pumpWidget(
      MaterialApp(
        home: WebAppShell(
          child: Builder(
            builder: (context) {
              observedSize = MediaQuery.sizeOf(context);
              return const SizedBox.expand();
            },
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('web-device-frame')), findsOneWidget);
    expect(observedSize.width, 412);
    expect(observedSize.height, 900);
  });

  testWidgets('phone browser fills the viewport without a device frame', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    late Size observedSize;
    await tester.pumpWidget(
      MaterialApp(
        home: WebAppShell(
          child: Builder(
            builder: (context) {
              observedSize = MediaQuery.sizeOf(context);
              return const SizedBox.expand();
            },
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('web-device-frame')), findsNothing);
    expect(observedSize.width, 390);
    expect(observedSize.height, 844);
  });
}
