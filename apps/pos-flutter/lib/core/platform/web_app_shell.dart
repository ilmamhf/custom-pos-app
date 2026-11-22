/// Browser shell that presents the POS as a phone-sized application.
///
/// The frame exists only when the browser has enough room for it. On an actual
/// phone-sized browser window, the app fills the viewport without a fake device
/// bezel.

import 'dart:math' as math;

import 'package:flutter/material.dart';

class WebAppShell extends StatelessWidget {
  const WebAppShell({super.key, required this.child});

  static const double _phoneWidth = 412;
  static const double _phoneMaxHeight = 900;
  static const double _desktopMargin = 32;

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final viewport = MediaQuery.sizeOf(context);
    final showDeviceFrame = viewport.width >= 480 && viewport.height >= 640;

    if (!showDeviceFrame) {
      return child;
    }

    final frameHeight = math.min(
      _phoneMaxHeight,
      viewport.height - _desktopMargin,
    );

    return ColoredBox(
      color: const Color(0xFFE8EEE9),
      child: Center(
        child: Container(
          key: const Key('web-device-frame'),
          width: _phoneWidth,
          height: frameHeight,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: const Color(0xFFB9C5BC), width: 1.5),
            boxShadow: const [
              BoxShadow(
                color: Color(0x241A2A20),
                blurRadius: 28,
                offset: Offset(0, 12),
              ),
            ],
          ),
          child: MediaQuery(
            data: MediaQuery.of(context).copyWith(
              size: Size(_phoneWidth, frameHeight),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}
