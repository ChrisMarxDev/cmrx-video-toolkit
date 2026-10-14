import 'dart:io';

import 'package:flut_script/media.dart';

Future<void> main(List<String> args) async {
  if (args.length != 3) {
    stderr.writeln(
      'Usage: dart run tool/prepare.dart VIDEO WORKSPACE WHISPER_MODEL',
    );
    exitCode = 64;
    return;
  }
  try {
    stdout.writeln(
      'Preparing video/audio and local transcript (existing completed workspaces are reused)…',
    );
    await prepare(
      File(args[0]).absolute.path,
      Directory(args[1]).absolute.path,
      File(args[2]).absolute.path,
    );
    stdout.writeln('Ready: ${args[1]}');
  } catch (e) {
    stderr.writeln(e);
    exitCode = 1;
  }
}
