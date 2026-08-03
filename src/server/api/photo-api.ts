import { app } from '../hono/hono';
import { Context } from "hono";
import result from '@/server/model/result';
import { photoService } from '@/server/service/photo-service';
import { getUserId } from "@/server/security/context";
import { type PhotoDeleteBo, type PhotoExistsBo, type PhotoFavoriteBo, type PhotoListBo, type PhotoRecycleBo, type PhotoRestoreBo, type PhotoTakenDateListBo } from '@/server/entity/bo/photo';

// This module registers photo-related interfaces。

// Query the current user's photo list by pagination and conditions。
app.post('/photo/list', async (c: Context) => {
  const body = await c.req.json<PhotoListBo>();
  const data = await photoService.list(body, getUserId());
  return c.json(result.ok(data));
})

// Count the shooting dates of the current user's existing photos by day。
app.post('/photo/takenDateList', async (c: Context) => {
  const body = await c.req.json<PhotoTakenDateListBo>();
  const data = await photoService.takenDateList(body, getUserId());
  return c.json(result.ok(data));
})

// Upload a single photo，Backend generation preview、thumbnail and meta information。
app.post('/photo/add', async (c: Context) => {
  const data = await photoService.add(await c.req.formData(), getUserId());
  return c.json(result.ok(data));
})

// Check whether the current user already has the same file before uploading。
app.post('/photo/exists', async (c: Context) => {
  const body = await c.req.json<PhotoExistsBo>();
  const data = await photoService.exists(body, getUserId());
  return c.json(result.ok(data));
})

// Move the specified photos of the current user to the trash。
app.post('/photo/recycle', async (c: Context) => {
  const body = await c.req.json<PhotoRecycleBo>();
  await photoService.recycle(body, getUserId());
  return c.json(result.ok());
})

// Set the collection status of photos specified by the current user。
app.post('/photo/favorite', async (c: Context) => {
  const body = await c.req.json<PhotoFavoriteBo>();
  await photoService.favorite(body, getUserId());
  return c.json(result.ok());
})

// Restore the specified photos in the current user's recycle bin。
app.post('/photo/restore', async (c: Context) => {
  const body = await c.req.json<PhotoRestoreBo>();
  await photoService.restore(body, getUserId());
  return c.json(result.ok());
})

// Completely delete the specified photo files and records of the current user。
app.post('/photo/delete', async (c: Context) => {
  const body = await c.req.json<PhotoDeleteBo>();
  await photoService.delete(body, getUserId());
  return c.json(result.ok());
})

// Clean up photo files and records in the current user's recycle bin。
app.post('/photo/clear', async (c: Context) => {
  await photoService.clear(getUserId());
  return c.json(result.ok());
})
