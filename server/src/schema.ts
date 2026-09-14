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
}, { additionalProperties: false });

export const SyncPayloadSchema = Type.Object({
  client_id: Type.String({ minLength: 1 }),
  updated_at: Type.Number(),
  active_workspace_id: Type.String(),
  workspaces: Type.Array(WorkspaceSchema),
}, { additionalProperties: false });

export type SyncPayloadType = Static<typeof SyncPayloadSchema>;
