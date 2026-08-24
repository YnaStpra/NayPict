import { Hono, Context } from 'hono';
import result from '@/server/model/result';
import { getUserId } from '@/server/security/context';
import { albumService } from '@/server/service/album-service';
import {
  type AlbumAddBo,
  type AlbumAddPhotoBo,
  type AlbumDeleteBo,
  type AlbumRemovePhotoBo,
  type AlbumSetCoverBo,
  type AlbumSetNameBo,
  type AlbumSetTopBo,
  type AlbumTogglePinPhotoBo,
} from '@/server/entity/bo/album';
import type { HonoEnv } from '../hono/type';

// This module registers album-related interfaces.

export function registerAlbumApi(app: Hono<HonoEnv>) {
  // Query the photo album list.
  app.post('/album/list', async (c: Context) => {
    const userId = getUserId();
    if (userId) {
      c.header('Cache-Control', 'no-store, private');
    } else {
      c.header('Cache-Control', 'public, max-age=15, s-maxage=60, stale-while-revalidate=300');
      c.header('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      c.header('Vary', 'Accept-Encoding, Cookie');
    }
    const data = await albumService.list();
    return c.json(result.ok(data));
  });

  // Query the virtual trash album.
  app.post('/album/trash', async (c: Context) => {
    const album = await albumService.trash(getUserId());
    return c.json(result.ok(album));
  });

  // Add photo album.
  app.post('/album/add', async (c: Context) => {
    const body = await c.req.json<AlbumAddBo>();
    const album = await albumService.add(body, getUserId());
    return c.json(result.ok(album));
  });

  // Set or auto-select album cover.
  app.post('/album/setCover', async (c: Context) => {
    const body = await c.req.json<AlbumSetCoverBo>();
    await albumService.setCover(body, getUserId());
    return c.json(result.ok());
  });

  // Query cover photo candidates for an album.
  app.post('/album/coverCandidates', async (c: Context) => {
    const { albumId } = await c.req.json<{ albumId: string }>();
    const candidates = await albumService.getCoverCandidates(albumId, getUserId());
    return c.json(result.ok(candidates));
  });

  // Add photos to album.
  app.post('/album/addPhoto', async (c: Context) => {
    const body = await c.req.json<AlbumAddPhotoBo>();
    await albumService.addPhoto(body, getUserId());
    return c.json(result.ok());
  });

  // Remove photo associations from album.
  app.post('/album/removePhoto', async (c: Context) => {
    const body = await c.req.json<AlbumRemovePhotoBo>();
    await albumService.removePhoto(body, getUserId());
    return c.json(result.ok());
  });

  // Toggle photo pin status in album (Max 3 pinned photos per album).
  app.post('/album/togglePinPhoto', async (c: Context) => {
    const body = await c.req.json<AlbumTogglePinPhotoBo>();
    const data = await albumService.togglePinPhoto(body, getUserId());
    return c.json(result.ok(data));
  });

  // Modify album name.
  app.post('/album/setName', async (c: Context) => {
    const body = await c.req.json<AlbumSetNameBo>();
    await albumService.setName(body, getUserId());
    return c.json(result.ok());
  });

  // Pin album to top.
  app.post('/album/setTop', async (c: Context) => {
    const body = await c.req.json<AlbumSetTopBo>();
    await albumService.setTop(body, getUserId());
    return c.json(result.ok());
  });

  // Delete album.
  app.post('/album/delete', async (c: Context) => {
    const body = await c.req.json<AlbumDeleteBo>();
    await albumService.delete(body, getUserId());
    return c.json(result.ok());
  });
}
