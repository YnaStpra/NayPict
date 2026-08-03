import { app } from '../hono/hono';
import { Context } from 'hono';
import result from '@/server/model/result';
import { getUserId } from '@/server/security/context';
import { albumService } from '@/server/service/album-service';
import { type AlbumAddBo, type AlbumAddPhotoBo, type AlbumDeleteBo, type AlbumRemovePhotoBo, type AlbumSetNameBo, type AlbumSetTopBo } from '@/server/entity/bo/album';

// This module registers album-related interfaces。

// Query the current user’s photo album list。
app.post('/album/list', async (c: Context) => {
  const data = await albumService.list(getUserId());
  return c.json(result.ok(data));
});

// Query the current user's recycle bin virtual album。
app.post('/album/trash', async (c: Context) => {
  const album = await albumService.trash(getUserId());
  return c.json(result.ok(album));
});

// Add the current user's photo album。
app.post('/album/add', async (c: Context) => {
  const body = await c.req.json<AlbumAddBo>();
  const album = await albumService.add(body, getUserId());
  return c.json(result.ok(album));
});

// Add photos to the current user's designated album。
app.post('/album/addPhoto', async (c: Context) => {
  const body = await c.req.json<AlbumAddPhotoBo>();
  await albumService.addPhoto(body, getUserId());
  return c.json(result.ok());
});

// Remove photo associations in the album specified by the current user。
app.post('/album/removePhoto', async (c: Context) => {
  const body = await c.req.json<AlbumRemovePhotoBo>();
  await albumService.removePhoto(body, getUserId());
  return c.json(result.ok());
});

// Modify the name of the current user-specified album。
app.post('/album/setName', async (c: Context) => {
  const body = await c.req.json<AlbumSetNameBo>();
  await albumService.setName(body, getUserId());
  return c.json(result.ok());
});

// Pin the album specified by the current user to the top。
app.post('/album/setTop', async (c: Context) => {
  const body = await c.req.json<AlbumSetTopBo>();
  await albumService.setTop(body, getUserId());
  return c.json(result.ok());
});

// Delete the album specified by the current user，And clean up the album photo associations。
app.post('/album/delete', async (c: Context) => {
  const body = await c.req.json<AlbumDeleteBo>();
  await albumService.delete(body, getUserId());
  return c.json(result.ok());
});
