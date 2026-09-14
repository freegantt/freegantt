# Type Alias: PresetRef

> **PresetRef** = [`ShippedPresetId`](ShippedPresetId.md) \| [`ViewPreset`](../interfaces/ViewPreset.md)

Defined in: time/presets.ts:226

A caller states either a shipped id (autocompletes) or a full custom object — never a bare
string with no closed set behind it (fix-issue1-apis.md Design #11).
