import { Type, Static } from '@sinclair/typebox';

export const TabItemSchema = Type.Object({
  uuid: Type.String({ minLength: 1 }),
  url: Type.String({ minLength: 1 }),
  title: Type.String(),
  favIconUrl: Type.Optional(Type.String()),
  pinned: Type.Boolean(),
  index: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const WorkspaceSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  tabs: Type.Array(TabItemSchema),
  customType: Type.Optional(Type.Union([
    Type.Literal('emoji'),
    Type.Literal('text'),
    Type.Literal('color'),
    Type.Literal('default'),
  ])),
  customValue: Type.Optional(Type.String()),
  color: Type.Optional(Type.String()),
  icon: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const SyncPayloadSchema = Type.Object({
  client_id: Type.String({ minLength: 1 }),
  updated_at: Type.Number(),
  active_workspace_id: Type.String(),
  workspaces: Type.Array(WorkspaceSchema),
}, { additionalProperties: false });

export type SyncPayloadType = Static<typeof SyncPayloadSchema>;

export const BackupConfigSchema = Type.Object({
  interval: Type.Union([
    Type.Literal('hourly'),
    Type.Literal('daily'),
    Type.Literal('weekly'),
    Type.Literal('monthly'),
    Type.Literal('disabled'),
  ]),
  retentionCopies: Type.Integer({ minimum: 1, maximum: 100 }),
}, { additionalProperties: false });

export type BackupConfigType = Static<typeof BackupConfigSchema>;

export const BackupMetadataSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  timestamp: Type.Number(),
  reason: Type.Union([Type.Literal('scheduled'), Type.Literal('manual')]),
  workspaces_count: Type.Integer({ minimum: 0 }),
  tabs_count: Type.Integer({ minimum: 0 }),
  client_id: Type.String(),
  size_bytes: Type.Optional(Type.Integer()),
}, { additionalProperties: false });

export const BackupListResponseSchema = Type.Object({
  backups: Type.Array(BackupMetadataSchema),
  config: BackupConfigSchema,
}, { additionalProperties: false });

