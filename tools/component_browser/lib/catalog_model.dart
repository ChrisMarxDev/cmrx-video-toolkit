/// A discoverable family may offer several existing widget presentations.
/// Legacy IDs stay addressable, but are not separate catalog entries.
class ComponentSpec {
  ComponentSpec(this.data);
  final Map<String, dynamic> data;
  String get id => data['id'];
  String get name => data['name'];
  String get widget => data['widget'];
  String get category => data['category'];
  String get description => data['description'];
  String get source => data['source'];
  bool get motion => data['motion'];
  Map<String, dynamic> get parameters => data['parameters'];
  List<dynamic> get variants => data['variants'];
  Map<String, dynamic> get presentations => data['presentations'] ?? {};
  Iterable<ComponentSpec> get implementations => presentations.isEmpty
      ? [this]
      : presentations.values.map(
          (v) => ComponentSpec(Map<String, dynamic>.from(v)),
        );
  bool matchesId(String candidate) =>
      candidate == id || presentations.containsKey(candidate);
  String get searchText => [
    id,
    name,
    widget,
    description,
    for (final p in presentations.values)
      '${p['id']} ${p['name']} ${p['widget']} ${p['description']}',
  ].join(' ').toLowerCase();

  String variantForRoute(String routeId, String? requested) {
    if (routeId != id && presentations.containsKey(routeId)) {
      final original = presentations[routeId] as Map;
      final sourceVariant =
          requested ?? (original['variants'] as List).first['id'];
      return variants.firstWhere(
        (v) =>
            v['presentation'] == routeId && v['sourceVariant'] == sourceVariant,
        orElse: () => variants.firstWhere((v) => v['presentation'] == routeId),
      )['id'];
    }
    return variants.firstWhere(
      (v) => v['id'] == requested,
      orElse: () => variants.first,
    )['id'];
  }

  ComponentSpec presentation(Map<String, dynamic> props) {
    if (presentations.isEmpty) return this;
    final key = props['presentation'] ?? id;
    final selected = presentations[key];
    if (selected == null)
      throw ArgumentError('Unknown presentation for $id: $key');
    return ComponentSpec(Map<String, dynamic>.from(selected));
  }

  Map<String, dynamic> parametersFor(Map<String, dynamic> props) =>
      presentation(props).parameters;

  Map<String, dynamic> props(String variant) {
    final preset = variants.firstWhere(
      (v) => v['id'] == variant,
      orElse: () => variants.first,
    );
    final choice = presentations.isEmpty
        ? <String, dynamic>{}
        : <String, dynamic>{'presentation': preset['presentation']};
    return {
      ...choice,
      for (final p in parametersFor(choice).entries) p.key: p.value['default'],
      ...Map<String, dynamic>.from(preset['props']),
    };
  }
}
