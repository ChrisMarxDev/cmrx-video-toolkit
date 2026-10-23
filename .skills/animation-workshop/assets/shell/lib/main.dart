import 'package:flutter/material.dart';

import 'workshop.dart';

// Replace this file with imports/builders for the actual widgets being tuned.
// Track IDs identify the exact widget property to apply in the video.
void main() => runApp(
      AnimationWorkshop(
        target: 'example-card',
        source: 'lib/main.dart',
        canvas: const Size(640, 360),
        seconds: 3,
        fps: 30,
        tracks: [
          MotionTrack(
            id: 'card.opacity',
            unit: 'opacity',
            from: 0,
            to: 1,
            min: 0,
            max: 1,
            start: .3,
            duration: .6,
          ),
          MotionTrack(
            id: 'card.y',
            unit: 'logicalPixels',
            from: 48,
            to: 0,
            min: -160,
            max: 160,
            start: .3,
            duration: .6,
          ),
          MotionTrack(
            id: 'card.scale',
            unit: 'factor',
            from: .85,
            to: 1,
            min: .1,
            max: 2,
            start: .3,
            duration: .6,
          ),
        ],
        builder: (context, seconds, values) => Center(
          child: Opacity(
            opacity: values['card.opacity']!.clamp(0, 1),
            child: Transform.translate(
              offset: Offset(0, values['card.y']!),
              child: Transform.scale(
                scale: values['card.scale']!,
                child: Container(
                  width: 300,
                  height: 150,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: const Color(0xff0c66e4),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Text(
                    'Your widget here',
                    style: TextStyle(color: Colors.white, fontSize: 26),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
