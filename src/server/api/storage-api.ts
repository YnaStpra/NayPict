import { app } from '../hono/hono';
import { Context } from 'hono';
import { type Storage, type StorageInto } from '@/server/entity/storage';
import { type StorageDeleteBo, type StorageSetTopBo, type StorageToggleStatusBo } from '@/server/entity/bo/storage';
import result from '@/server/model/result';
import { getUserId } from '@/server/security/context';
import { storageService } from '@/server/service/storage-service';

// This module registers storage configuration related interfaces。

// Query all normal storage configuration options。
app.post('/storage/select', async (c: Context) => {
  const data = await storageService.select();
  return c.json(result.ok(data));
});

// Query the list of all storage configurations。
app.post('/storage/list', async (c: Context) => {
  const data = await storageService.list();
  return c.json(result.ok(data));
});

// Add the current user's storage configuration。
app.post('/storage/add', async (c: Context) => {
  const body = await c.req.json<StorageInto>();
  await storageService.add(body, getUserId());
  return c.json(result.ok());
});

// Modify the storage configuration of the current user，Does not return business data。
app.post('/storage/set', async (c: Context) => {
  const body = await c.req.json<Storage>();
  await storageService.set(body);
  return c.json(result.ok());
});

// Pin the specified storage configuration to the top，Does not return business data。
app.post('/storage/setTop', async (c: Context) => {
  const body = await c.req.json<StorageSetTopBo>();
  await storageService.setTop(body);
  return c.json(result.ok());
});

// Toggles the enabled state of a specified storage configuration，Does not return business data。
app.post('/storage/toggleStatus', async (c: Context) => {
  const body = await c.req.json<StorageToggleStatusBo>();
  await storageService.toggleStatus(body);
  return c.json(result.ok());
});

// Delete the specified storage configuration of the current user，Does not return business data。
app.post('/storage/delete', async (c: Context) => {
  const body = await c.req.json<StorageDeleteBo>();
  await storageService.delete(body.storageId);
  return c.json(result.ok());
});
