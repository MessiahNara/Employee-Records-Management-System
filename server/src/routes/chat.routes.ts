import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { getIO } from '../socket';

const router = Router();
const prisma = new PrismaClient();

const GROUPS_FILE = path.join(__dirname, '../../uploads/data/group_chats.json');

export interface GroupChat {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

function readGroupChats(): GroupChat[] {
  try {
    if (!fs.existsSync(GROUPS_FILE)) {
      const dir = path.dirname(GROUPS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(GROUPS_FILE, '[]', 'utf-8');
      return [];
    }
    const data = fs.readFileSync(GROUPS_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading group_chats.json:', err);
    return [];
  }
}

function saveGroupChats(groups: GroupChat[]) {
  try {
    const dir = path.dirname(GROUPS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving group_chats.json:', err);
  }
}

const READS_FILE = path.join(__dirname, '../../uploads/data/group_chat_reads.json');

function readGroupChatReads(): Record<string, string> {
  try {
    if (!fs.existsSync(READS_FILE)) {
      const dir = path.dirname(READS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(READS_FILE, '{}', 'utf-8');
      return {};
    }
    const data = fs.readFileSync(READS_FILE, 'utf-8');
    return JSON.parse(data || '{}');
  } catch (err) {
    return {};
  }
}

function saveGroupChatReads(reads: Record<string, string>) {
  try {
    const dir = path.dirname(READS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(READS_FILE, JSON.stringify(reads, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving group_chat_reads.json:', err);
  }
}

// GET /api/chats/unread - Get unread message counts grouped by sender / group
router.get('/unread', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User ID not provided' });
  }

  try {
    // 1. Direct unread 1-on-1 messages
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

    // 2. Group unread messages
    const allGroups = readGroupChats();
    const userGroups = allGroups.filter((g) => Array.isArray(g.memberIds) && g.memberIds.includes(userId));
    const reads = readGroupChatReads();

    for (const group of userGroups) {
      const lastReadIso = reads[`${userId}_${group.id}`] || group.createdAt;
      const groupUnreadCount = await prisma.chatMessage.count({
        where: {
          recipientId: group.id,
          senderId: { not: userId },
          createdAt: { gt: new Date(lastReadIso) },
        },
      });

      if (groupUnreadCount > 0) {
        counts[group.id] = groupUnreadCount;
      }
    }

    res.json(counts);
  } catch (error) {
    console.error('Error fetching unread chat counts:', error);
    res.status(500).json({ error: 'Failed to fetch unread chat counts' });
  }
});

// GET /api/chats/groups - Get all group chats for the logged-in user
router.get('/groups', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User ID not provided' });
  }

  try {
    const allGroups = readGroupChats();
    // Privacy: Only return groups the user is a member of
    const userGroups = allGroups.filter((g) => Array.isArray(g.memberIds) && g.memberIds.includes(userId));

    // Fetch members' profiles
    const allMemberIds = Array.from(new Set(userGroups.flatMap((g) => g.memberIds || [])));
    const memberUsers = await prisma.user.findMany({
      where: { id: { in: allMemberIds } },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        profilePicture: true,
      },
    });
    const userMap = new Map(memberUsers.map((u) => [u.id, u]));

    const result = await Promise.all(
      userGroups.map(async (group) => {
        const lastMsg = await prisma.chatMessage.findFirst({
          where: { recipientId: group.id },
          orderBy: { createdAt: 'desc' },
        });

        const members = (group.memberIds || []).map((mId) => userMap.get(mId) || { id: mId, username: mId, firstName: 'User', lastName: '' });

        return {
          id: group.id,
          username: group.name,
          firstName: group.name,
          lastName: '',
          role: 'Group Chat',
          isGroup: true,
          creatorId: group.creatorId,
          creatorName: group.creatorName,
          members,
          lastMessage: lastMsg
            ? {
                content: `${lastMsg.senderName}: ${lastMsg.content}`,
                createdAt: lastMsg.createdAt,
                senderId: lastMsg.senderId,
                senderName: lastMsg.senderName,
              }
            : null,
        };
      })
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching group chats:', error);
    res.status(500).json({ error: 'Failed to fetch group chats' });
  }
});

// POST /api/chats/groups - Create a group chat
router.post('/groups', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;
  const { id, name, creatorId, creatorName, memberIds } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Group name is required' });
  }

  try {
    const actorId = creatorId || userId || 'system';
    let actorName = creatorName;
    if (!actorName && actorId !== 'system') {
      const u = await prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } });
      if (u) actorName = `${u.firstName} ${u.lastName}`.trim();
    }

    const groups = readGroupChats();
    const existingIndex = groups.findIndex((g) => g.id === id);

    const members = Array.from(new Set([actorId, ...(memberIds || [])]));

    const groupObj: GroupChat = {
      id: id || `group_${Date.now()}`,
      name: name.trim(),
      creatorId: actorId,
      creatorName: actorName || 'User',
      memberIds: members,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      groups[existingIndex] = { ...groups[existingIndex], ...groupObj };
    } else {
      groups.unshift(groupObj);
    }

    saveGroupChats(groups);

    // Create system message welcoming the group
    await prisma.chatMessage.create({
      data: {
        senderId: 'system',
        senderName: 'System',
        recipientId: groupObj.id,
        content: `Group "${groupObj.name}" was created by ${groupObj.creatorName}`,
        read: true,
      },
    });

    getIO()?.emit('chatsUpdated');
    res.status(201).json(groupObj);
  } catch (error) {
    console.error('Error creating group chat:', error);
    res.status(500).json({ error: 'Failed to create group chat' });
  }
});

// POST /api/chats/groups/:id/members - Add members to group
router.post('/groups/:id/members', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;
  const { id } = req.params;
  const { memberIds } = req.body;

  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ error: 'memberIds array is required' });
  }

  try {
    const groups = readGroupChats();
    const group = groups.find((g) => g.id === id);

    if (!group) {
      return res.status(404).json({ error: 'Group chat not found' });
    }

    // Privacy guard: Requester must be a member of the group
    if (userId && !group.memberIds.includes(userId)) {
      return res.status(403).json({ error: 'Forbidden: You are not a member of this group' });
    }

    const addedUsers = await prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: { firstName: true, lastName: true },
    });
    const addedNames = addedUsers.map((u) => `${u.firstName} ${u.lastName}`.trim()).join(', ');

    group.memberIds = Array.from(new Set([...group.memberIds, ...memberIds]));
    group.updatedAt = new Date().toISOString();
    saveGroupChats(groups);

    // Add system notification message in group chat
    let actorName = 'A member';
    if (userId) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      if (u) actorName = `${u.firstName} ${u.lastName}`.trim();
    }

    await prisma.chatMessage.create({
      data: {
        senderId: 'system',
        senderName: 'System',
        recipientId: group.id,
        content: `${actorName} added ${addedNames || 'new members'} to the group chat`,
        read: true,
      },
    });

    getIO()?.emit('chatsUpdated');
    res.json(group);
  } catch (error) {
    console.error('Error adding members to group:', error);
    res.status(500).json({ error: 'Failed to add members to group' });
  }
});

// DELETE /api/chats/groups/:id/members/:memberId - Remove member from group
router.delete('/groups/:id/members/:memberId', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;
  const { id, memberId } = req.params;

  try {
    const groups = readGroupChats();
    const group = groups.find((g) => g.id === id);

    if (!group) {
      return res.status(404).json({ error: 'Group chat not found' });
    }

    // Requester must be member, creator, or self
    if (userId && !group.memberIds.includes(userId)) {
      return res.status(403).json({ error: 'Forbidden: You are not a member of this group' });
    }

    const removedUser = await prisma.user.findUnique({
      where: { id: memberId },
      select: { firstName: true, lastName: true },
    });
    const removedName = removedUser ? `${removedUser.firstName} ${removedUser.lastName}`.trim() : 'a member';

    group.memberIds = group.memberIds.filter((m) => m !== memberId);
    group.updatedAt = new Date().toISOString();
    saveGroupChats(groups);

    let actorName = 'A member';
    if (userId) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      if (u) actorName = `${u.firstName} ${u.lastName}`.trim();
    }

    await prisma.chatMessage.create({
      data: {
        senderId: 'system',
        senderName: 'System',
        recipientId: group.id,
        content: memberId === userId ? `${actorName} left the group chat` : `${actorName} removed ${removedName} from the group chat`,
        read: true,
      },
    });

    getIO()?.emit('chatsUpdated');
    res.json(group);
  } catch (error) {
    console.error('Error removing member from group:', error);
    res.status(500).json({ error: 'Failed to remove member from group' });
  }
});

// DELETE /api/chats/groups/:id - Delete group chat
router.delete('/groups/:id', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;
  const { id } = req.params;

  try {
    let groups = readGroupChats();
    const group = groups.find((g) => g.id === id);

    if (!group) {
      return res.status(404).json({ error: 'Group chat not found' });
    }

    groups = groups.filter((g) => g.id !== id);
    saveGroupChats(groups);

    // Delete all messages in this group
    await prisma.chatMessage.deleteMany({
      where: { recipientId: id },
    });

    getIO()?.emit('chatsUpdated');
    res.json({ message: 'Group chat deleted successfully' });
  } catch (error) {
    console.error('Error deleting group chat:', error);
    res.status(500).json({ error: 'Failed to delete group chat' });
  }
});

// GET /api/chats/recent - Get recent chat contacts and groups for the logged-in user
router.get('/recent', async (req: Request, res: Response) => {
  const userId = (req.headers['x-logged-in-user-id'] || req.headers['x-user-id']) as string;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User ID not provided' });
  }

  try {
    // 1. Direct messages contacts
    const sentTo = await prisma.chatMessage.findMany({
      where: { senderId: userId, deletedBySender: false, NOT: { recipientId: { startsWith: 'group_' } } },
      select: { recipientId: true },
      distinct: ['recipientId'],
    });

    const receivedFrom = await prisma.chatMessage.findMany({
      where: { recipientId: userId, deletedByRecipient: false, NOT: { senderId: { startsWith: 'group_' } } },
      select: { senderId: true },
      distinct: ['senderId'],
    });

    const contactIds = Array.from(
      new Set([...sentTo.map((m) => m.recipientId), ...receivedFrom.map((m) => m.senderId)])
    ).filter((id) => id !== 'system' && !id.startsWith('group_'));

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
          isGroup: false,
          lastMessage: lastMsg
            ? {
                content: lastMsg.content,
                createdAt: lastMsg.createdAt,
                senderId: lastMsg.senderId,
              }
            : null,
        };
      })
    );

    // 2. User's group chats
    const allGroups = readGroupChats();
    const userGroups = allGroups.filter((g) => Array.isArray(g.memberIds) && g.memberIds.includes(userId));

    const allMemberIds = Array.from(new Set(userGroups.flatMap((g) => g.memberIds || [])));
    const memberUsers = await prisma.user.findMany({
      where: { id: { in: allMemberIds } },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        profilePicture: true,
      },
    });
    const userMap = new Map(memberUsers.map((u) => [u.id, u]));

    const groupContacts = await Promise.all(
      userGroups.map(async (group) => {
        const lastMsg = await prisma.chatMessage.findFirst({
          where: { recipientId: group.id },
          orderBy: { createdAt: 'desc' },
        });

        const members = (group.memberIds || []).map((mId) => userMap.get(mId) || { id: mId, username: mId, firstName: 'User', lastName: '' });

        return {
          id: group.id,
          username: group.name,
          firstName: group.name,
          lastName: '',
          role: 'Group Chat',
          isGroup: true,
          creatorId: group.creatorId,
          creatorName: group.creatorName,
          members,
          lastMessage: lastMsg
            ? {
                content: `${lastMsg.senderName}: ${lastMsg.content}`,
                createdAt: lastMsg.createdAt,
                senderId: lastMsg.senderId,
                senderName: lastMsg.senderName,
              }
            : null,
        };
      })
    );

    const allConversations = [...contactsWithLastMessage, ...groupContacts];

    // Sort conversations: most recent message first
    allConversations.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    res.json(allConversations);
  } catch (error) {
    console.error('Error fetching recent chat contacts:', error);
    res.status(500).json({ error: 'Failed to fetch recent chat contacts' });
  }
});

// GET /api/chats - Get conversation history (Strict privacy: 1-on-1 direct or group members only)
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
    const isGroup = recipientId.startsWith('group_');

    if (isGroup) {
      // Privacy Guard: User MUST be an approved member of this group
      const groups = readGroupChats();
      const group = groups.find((g) => g.id === recipientId);

      if (!group || !Array.isArray(group.memberIds) || !group.memberIds.includes(userId)) {
        return res.status(403).json({ error: 'Forbidden: You are not an approved member of this group chat' });
      }

      // Mark this group as read for this user right now
      const reads = readGroupChatReads();
      reads[`${userId}_${recipientId}`] = new Date().toISOString();
      saveGroupChatReads(reads);

      const messages = await prisma.chatMessage.findMany({
        where: {
          recipientId: recipientId,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      getIO()?.emit('chatsUpdated');
      return res.json(messages);
    }

    // Direct 1-on-1 Message Privacy Guard:
    // ONLY fetch messages between userId and recipientId
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

    // Mark incoming messages from the recipient to the user as read
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

// POST /api/chats - Send a message (Direct 1-on-1 or Group Message)
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
    const isGroup = recipientId.startsWith('group_');

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

    if (isGroup) {
      // Privacy Guard: Sender must be a member of the group
      const groups = readGroupChats();
      const group = groups.find((g) => g.id === recipientId);

      if (!group || !Array.isArray(group.memberIds) || !group.memberIds.includes(userId)) {
        return res.status(403).json({ error: 'Forbidden: You are not a member of this group chat' });
      }

      const message = await prisma.chatMessage.create({
        data: {
          senderId: userId,
          senderName,
          recipientId,
          content: content.trim(),
          read: true,
        },
      });

      getIO()?.emit('chatsUpdated');
      return res.status(201).json(message);
    }

    // Direct 1-on-1 message
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
    console.error('Error sending message:', error);
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
    const isGroup = recipientId.startsWith('group_');

    if (isGroup) {
      // For groups, remove the user from the group
      const groups = readGroupChats();
      const group = groups.find((g) => g.id === recipientId);
      if (group) {
        group.memberIds = group.memberIds.filter((m) => m !== userId);
        saveGroupChats(groups);
      }
      getIO()?.emit('chatsUpdated');
      return res.json({ message: 'Left group chat successfully' });
    }

    const updateSent = await prisma.chatMessage.updateMany({
      where: { senderId: userId, recipientId: recipientId },
      data: { deletedBySender: true },
    });

    const updateReceived = await prisma.chatMessage.updateMany({
      where: { senderId: recipientId, recipientId: userId },
      data: { deletedByRecipient: true },
    });

    // Clean up messages deleted by both users
    await prisma.chatMessage.deleteMany({
      where: {
        deletedBySender: true,
        deletedByRecipient: true,
      },
    });

    getIO()?.emit('chatsUpdated');
    res.json({ message: 'Conversation deleted successfully', count: updateSent.count + updateReceived.count });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;
