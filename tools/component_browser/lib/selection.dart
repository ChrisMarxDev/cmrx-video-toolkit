import 'dart:convert';
import 'package:flutter/foundation.dart';

/// Session-owned, insertion-ordered selection. Entries are snapshots, so editing
/// a preview cannot silently mutate an already selected recipe.
class ComponentSelection extends ChangeNotifier {
  final Map<String, Map<String, dynamic>> _entries = {};
  int get length => _entries.length;
  bool contains(String id) => _entries.containsKey(id);
  void put(String id, String variant, Map<String, dynamic> props) {
    _entries[id] =
        jsonDecode(
              jsonEncode({'component': id, 'variant': variant, 'props': props}),
            )
            as Map<String, dynamic>;
    notifyListeners();
  }

  void remove(String id) {
    if (_entries.remove(id) != null) notifyListeners();
  }

  void clear() {
    if (_entries.isEmpty) return;
    _entries.clear();
    notifyListeners();
  }

  String encode({required String previewTheme}) =>
      const JsonEncoder.withIndent('  ').convert({
        'schemaVersion': 1,
        'kind': 'component-selection',
        'previewTheme': previewTheme,
        'components': _entries.values.toList(),
      });
}
