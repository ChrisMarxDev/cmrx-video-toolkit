import 'package:flutter/widgets.dart';

void checkProgress(double value) {
  if (!value.isFinite || value < 0 || value > 1) {
    throw ArgumentError.value(
      value,
      'progress',
      'Expected a finite value in 0..1',
    );
  }
}

void checkSize(Size size) {
  if (!size.width.isFinite || !size.height.isFinite || size.isEmpty) {
    throw ArgumentError.value(
      size,
      'size',
      'Expected finite positive dimensions',
    );
  }
}
