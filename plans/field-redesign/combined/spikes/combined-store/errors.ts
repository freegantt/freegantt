/** Spike errors. Names match the ADR vocabulary where the combined store probes them. */

export class UnknownFieldError extends Error {
  readonly name = 'UnknownFieldError';
  constructor(key: string) {
    super(`entries.update: unknown field "${key}". Declare it on fields, or write it at ingest.`);
  }
}

export class UndeclaredPropsKeyError extends Error {
  readonly name = 'UndeclaredPropsKeyError';
  constructor(key: string) {
    super(`entries.update: undeclared props key "${key}". Declare { key: '${key}' } on fields.`);
  }
}

export class FieldNamedAtTopAndInPropsError extends Error {
  readonly name = 'FieldNamedAtTopAndInPropsError';
  constructor(key: string) {
    super(
      `entries.update: "${key}" is named at the top and inside props. Name it once — at the top, or inside props.`,
    );
  }
}

export class ComputedFieldCannotBeWrittenError extends Error {
  readonly name = 'ComputedFieldCannotBeWrittenError';
  constructor(key: string) {
    super(`entries.update: "${key}" is computed and cannot be written.`);
  }
}

export class DerivedFieldNotWritableError extends Error {
  readonly name = 'DerivedFieldNotWritableError';
  constructor(id: string, key: string) {
    super(`entries.update: "${key}" on "${id}" is derived and cannot be written.`);
  }
}

export class FieldNotEditableError extends Error {
  readonly name = 'FieldNotEditableError';
  constructor(key: string) {
    super(`entries.update: "${key}" is not editable.`);
  }
}

export class IllegalCoreFieldOverrideError extends Error {
  readonly name = 'IllegalCoreFieldOverrideError';
  constructor(key: string) {
    super(`fields: "${key}" already names a core field. Remove this declaration.`);
  }
}

export class InvalidInstantError extends Error {
  readonly name = 'InvalidInstantError';
  constructor() {
    super('write both start and end, or write neither');
  }
}

export class EmptySegmentsError extends Error {
  readonly name = 'EmptySegmentsError';
  constructor() {
    super('segments must not be empty');
  }
}

export class PluginFieldCollisionError extends Error {
  readonly name = 'PluginFieldCollisionError';
  constructor(plugin: string, key: string) {
    super(
      `entries.update: "${key}" is owned by plugin "${plugin}". Write "${plugin}:${key}" instead.`,
    );
  }
}

export class PluginWriteCollisionError extends Error {
  readonly name = 'PluginWriteCollisionError';
  constructor(field: string, plugins: readonly string[]) {
    super(
      `edit extender: two plugins wrote "${field}" (${plugins.join(', ')}). Report, do not last-win.`,
    );
  }
}

export class ChildAddWouldWidenLockedParentError extends Error {
  readonly name = 'ChildAddWouldWidenLockedParentError';
  constructor(parentId: string, field: string) {
    super(
      `entries.add: child would widen locked parent "${parentId}" field "${field}". Whole add refused.`,
    );
  }
}

export class DocumentMigrationReport {
  readonly name = 'DocumentMigrationReport';
  readonly messages: readonly string[];
  constructor(messages: readonly string[]) {
    this.messages = messages;
  }
}
