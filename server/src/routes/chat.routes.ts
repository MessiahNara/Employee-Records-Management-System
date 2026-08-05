import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getIO } from '../socket';

const router = Router();
const prisma = new PrismaClient();

// GET /api/chats/unread - Get unread message counts grouped by sender
router.get('/unread', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User ID not provided' });
  }

  try {
    const unread = await prisma.chatMessage.groupBy({
      by: ['senderId'],
      where: {
        recipientId: userId,
        read: false,
      },
      _count: {
        id: true,
      },
    });

    const counts = unread.reduce((acc, curr) => {
      acc[curr.senderId] = curr._count.id;
      return acc;
    }, {} as Record<string, number>);

    res.json(counts);
  } catch (error) {
    console.error('Error fetching unread chat counts:', error);
    res.status(500).json({ error: 'Failed to fetch unread chat counts' });
  }
});

// GET /api/chats/recent - Get recent chat contacts for the logged-in user
router.get('/recent', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User ID not provided' });
  }

  try {
    const sentTo = await prisma.chatMessage.findMany({
      where: { senderId: userId, deletedBySender: false },
      select: { recipientId: true },
      distinct: ['recipientId'],
    });

    const receivedFrom = await prisma.chatMessage.findMany({
      where: { recipientId: userId, deletedByRecipient: false },
      select: { senderId: true },
      distinct: ['senderId'],
    });

    const contactIds = Array.from(new Set([
      ...sentTo.map(m => m.recipientId),
      ...receivedFrom.map(m => m.senderId),
    ]));

    const contacts = await prisma.user.findMany({
      where: { id: { in: contactIds } },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        profilePicture: true,
        lastActive: true,
      },
    });

    // Fetch the last message for each contact to display in the inbox and to sort contacts list
    const contactsWithLastMessage = await Promise.all(
      contacts.map(async (contact) => {
        const lastMsg = await prisma.chatMessage.findFirst({
          where: {
            OR: [
              { senderId: userId, recipientId: contact.id, deletedBySender: false },
              { senderId: contact.id, recipientId: userId, deletedByRecipient: false },
            ],
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
        return {
          ...contact,
          lastMessage: lastMsg ? {
            content: lastMsg.content,
            createdAt: lastMsg.createdAt,
            senderId: lastMsg.senderId,
          } : null,
        };
      })
    );

    // Sort contacts: most recent message first. If no messages, place at the bottom (or top for new chats)
    contactsWithLastMessage.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    res.json(contactsWithLastMessage);
  } catch (error) {
    console.error('Error fetching recent chat contacts:', error);
    res.status(500).json({ error: 'Failed to fetch recent chat contacts' });
  }
});

// GET /api/chats - Get conversation history with a specific recipient
router.get('/', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;
  const recipientId = req.query.recipientId as string;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User ID not provided' });
  }

  if (!recipientId) {
    return res.status(400).json({ error: 'recipientId query parameter is required' });
  }

  try {
    // 1. Fetch conversation history
    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: userId, recipientId: recipientId, deletedBySender: false },
          { senderId: recipientId, recipientId: userId, deletedByRecipient: false },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // 2. Mark incoming messages from the recipient to the user as read
    await prisma.chatMessage.updateMany({
      where: {
        senderId: recipientId,
        recipientId: userId,
        read: false,
      },
      data: {
        read: true,
      },
    });

    getIO()?.emit('chatsUpdated');
    res.json(messages);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// POST /api/chats - Send a private message to a recipient
router.post('/', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;
  const { recipientId, content } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User ID not provided' });
  }
  if (!recipientId) {
    return res.status(400).json({ error: 'recipientId is required' });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    // Look up sender details
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
      },
    });

    if (!sender) {
      return res.status(404).json({ error: 'Sender user not found' });
    }

    const senderName = `${sender.firstName} ${sender.lastName}`.trim() || 'User';

    const message = await prisma.chatMessage.create({
      data: {
        senderId: userId,
        senderName,
        recipientId,
        content: content.trim(),
        read: false,
      },
    });

    getIO()?.emit('chatsUpdated');
    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending private message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// DELETE /api/chats/:recipientId - Delete conversation history with a specific recipient
router.delete('/:recipientId', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;
  const { recipientId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User ID not provided' });
  }

  if (!recipientId) {
    return res.status(400).json({ error: 'recipientId is required' });
  }

  try {
    const updateSent = await prisma.chatMessage.updateMany({
      where: { senderId: userId, recipientId: recipientId },
      data: { deletedBySender: true }
    });

    const updateReceived = await prisma.chatMessage.updateMany({
      where: { senderId: recipientId, recipientId: userId },
      data: { deletedByRecipient: true }
    });

    // Clean up messages deleted by both users
    await prisma.chatMessage.deleteMany({
      where: {
        deletedBySender: true,
        deletedByRecipient: true
      }
    });

    getIO()?.emit('chatsUpdated');
    res.json({ message: 'Conversation deleted successfully', count: updateSent.count + updateReceived.count });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;

