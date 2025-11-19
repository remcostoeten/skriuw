import { Hono } from 'hono';
import * as queries from '../db/queries';
import * as mutations from '../db/mutations';
import type { CreateNoteData, UpdateNoteData, CreateFolderData } from '../../shared/db/types';

const router = new Hono();

/**
 * GET /api/notes - Get all items (notes and folders)
 */
router.get('/', async (c) => {
  try {
    const items = await queries.getItems();
    return c.json({ success: true, data: items });
  } catch (error: any) {
    console.error('Error fetching items:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/notes/folder/:id/children/count - Count children of a folder
 */
router.get('/folder/:id/children/count', async (c) => {
  try {
    const id = c.req.param('id');
    const count = await mutations.countChildren(id);
    return c.json({ success: true, data: { count } });
  } catch (error: any) {
    console.error('Error counting children:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/notes/:id/note - Get a specific note by ID
 */
router.get('/:id/note', async (c) => {
  try {
    const id = c.req.param('id');
    const note = await queries.findNote(id);
    
    if (!note) {
      return c.json({ success: false, error: 'Note not found' }, 404);
    }
    
    return c.json({ success: true, data: note });
  } catch (error: any) {
    console.error('Error fetching note:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/notes/:id - Get a specific note or folder by ID
 */
router.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const item = await queries.findItemById(id);
    
    if (!item) {
      return c.json({ success: false, error: 'Item not found' }, 404);
    }
    
    return c.json({ success: true, data: item });
  } catch (error: any) {
    console.error('Error fetching item:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /api/notes - Create a new note
 */
router.post('/', async (c) => {
  try {
    const data: CreateNoteData = await c.req.json();
    
    if (!data.name) {
      return c.json({ success: false, error: 'Name is required' }, 400);
    }
    
    const note = await mutations.createNote(data);
    return c.json({ success: true, data: note }, 201);
  } catch (error: any) {
    console.error('Error creating note:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /api/notes/folder - Create a new folder
 */
router.post('/folder', async (c) => {
  try {
    const data: CreateFolderData = await c.req.json();
    
    if (!data.name) {
      return c.json({ success: false, error: 'Name is required' }, 400);
    }
    
    const folder = await mutations.createFolder(data);
    return c.json({ success: true, data: folder }, 201);
  } catch (error: any) {
    console.error('Error creating folder:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * PUT /api/notes/:id - Update a note
 */
router.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const data: UpdateNoteData = await c.req.json();
    
    const note = await mutations.updateNote(id, data);
    
    if (!note) {
      return c.json({ success: false, error: 'Note not found' }, 404);
    }
    
    return c.json({ success: true, data: note });
  } catch (error: any) {
    console.error('Error updating note:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * PATCH /api/notes/:id/rename - Rename an item (note or folder)
 */
router.patch('/:id/rename', async (c) => {
  try {
    const id = c.req.param('id');
    const { name } = await c.req.json();
    
    if (!name) {
      return c.json({ success: false, error: 'Name is required' }, 400);
    }
    
    const item = await mutations.renameItem(id, name);
    
    if (!item) {
      return c.json({ success: false, error: 'Item not found' }, 404);
    }
    
    return c.json({ success: true, data: item });
  } catch (error: any) {
    console.error('Error renaming item:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * PATCH /api/notes/:id/move - Move an item to a different folder
 */
router.patch('/:id/move', async (c) => {
  try {
    const id = c.req.param('id');
    const { targetFolderId } = await c.req.json(); // null for root
    
    const success = await mutations.moveItem(id, targetFolderId || null);
    
    if (!success) {
      return c.json({ success: false, error: 'Item not found' }, 404);
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error moving item:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * DELETE /api/notes/:id - Delete an item (note or folder)
 */
router.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const success = await mutations.deleteItem(id);
    
    if (!success) {
      return c.json({ success: false, error: 'Item not found' }, 404);
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting item:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default router;
