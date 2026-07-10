import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { uploadProfilePicture } from '../middleware/upload';
import { requireSuperadminApproval } from '../middleware/superadminApproval';
import { issueSuperadminApprovalToken } from '../lib/superadminApproval';
import path from 'path';
import fs from 'fs';

const SALT_ROUNDS = 10;

// Resolve the profile-pictures upload directory in a way that works both in
// development (source-relative __dirname) and in the bundled Electron installer
// (where __dirname points to the resources/ folder, not the original source tree).
function getProfilePicturesDir(): string {
  return process.env.UPLOADS_DIR
    ? path.join(process.env.UPLOADS_DIR, 'profile-pictures')
    : path.join(__dirname, '../../uploads/profile-pictures');
}

const router = Router();

// Get all users
router.get('/', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        profilePicture: true, // Include profile picture
        role: true,
        permissions: true, // Include permissions
        lastLogin: true, // Include last login timestamp
        createdAt: true,
        updatedAt: true,
        // Exclude password from response
      },
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        profilePicture: true, // Include profile picture
        role: true,
        permissions: true, // Include permissions
        lastLogin: true, // Include last login timestamp
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, username, password, firstName, lastName, role, permissions } = req.body;

    // Validation
    if (!id || !username || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ error: 'ID, username, password, firstName, lastName, and role are required' });
    }

    // Check if ID already exists
    const existingUserById = await prisma.user.findUnique({
      where: { id },
    });

    if (existingUserById) {
      return res.status(409).json({ error: 'User ID already exists' });
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const user = await prisma.user.create({
      data: {
        id,
        username,
        password: await bcrypt.hash(password, SALT_ROUNDS),
        firstName,
        lastName,
        role,
        permissions: permissions || null, // Store permissions if provided
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (Full update - PUT)
router.put('/:id', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, firstName, lastName, role, password } = req.body;

    const updateData: any = {};
    if (username) updateData.username = username;
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (role) updateData.role = role;
    if (password) updateData.password = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        updatedAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Partial update user (PATCH)
router.patch('/:id', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Reject empty or invalid IDs
    if (!id || id.trim() === '') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const updateData: any = {};

    // Only include fields that are present in the request
    const allowedFields = ['id', 'username', 'firstName', 'lastName', 'role', 'password', 'permissions'];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Reject empty string values for required fields
    if (updateData.id !== undefined && updateData.id.trim() === '') {
      return res.status(400).json({ error: 'User ID cannot be empty' });
    }

    // Check if there are any fields to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // If updating ID, check if new ID already exists
    if (updateData.id && updateData.id !== id) {
      const existingUser = await prisma.user.findUnique({
        where: { id: updateData.id },
      });

      if (existingUser) {
        return res.status(409).json({ error: 'User ID already exists' });
      }
    }

    // Check if trying to change role of a superadmin user
    if (updateData.role !== undefined) {
      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { role: true },
      });

      if (existingUser && existingUser.role === 'superadmin') {
        return res.status(403).json({ error: 'Super Admin role cannot be changed' });
      }
    }

    // Hash password if present
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, SALT_ROUNDS);
    }

    // If ID is being updated, we need to handle it specially
    if (updateData.id && updateData.id !== id) {
      // Create new user with new ID and delete old one (within transaction)
      const result = await prisma.$transaction(async (tx) => {
        // Get old user data
        const oldUser = await tx.user.findUnique({ where: { id } });
        if (!oldUser) {
          throw new Error('User not found');
        }

        // Delete old user first to avoid unique constraint violation
        await tx.user.delete({ where: { id } });

        // Create new user with new ID
        const newUser = await tx.user.create({
          data: {
            id: updateData.id,
            username: updateData.username !== undefined ? updateData.username : oldUser.username,
            password: updateData.password !== undefined ? updateData.password : oldUser.password,
            firstName: updateData.firstName !== undefined ? updateData.firstName : oldUser.firstName,
            lastName: updateData.lastName !== undefined ? updateData.lastName : oldUser.lastName,
            role: updateData.role !== undefined ? updateData.role : oldUser.role,
            permissions: updateData.permissions !== undefined ? updateData.permissions : oldUser.permissions,
            createdAt: oldUser.createdAt,
            updatedAt: new Date(),
          },
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            role: true,
            permissions: true,
            updatedAt: true,
          },
        });

        return newUser;
      });

      res.json(result);
    } else {
      // Normal update without ID change
      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          profilePicture: true, // Include profile picture
          role: true,
          permissions: true,
          updatedAt: true,
        },
      });

      res.json(user);
    }
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
});

// Delete user
router.delete('/:id', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { id },
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log(`[auth] Login attempt from ${clientIp}`, { 
      username, 
      passwordLength: password?.length || 0 
    });
    
    // Validation
    if (!username || !password) {
      console.warn('[auth] Missing username or password in request');
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user by username (try exact, then case-insensitive fallback)
    const usernameTrim = username.trim();
    let user = await prisma.user.findUnique({
      where: { username: usernameTrim },
      select: {
        id: true,
        username: true,
        password: true,
        firstName: true,
        lastName: true,
        profilePicture: true, // Include profile picture
        role: true,
        permissions: true, // Include permissions
        lastLogin: true,
        createdAt: true,
      },
    });

    if (!user) {
      // Try case-insensitive match as a fallback
      try {
        user = await prisma.user.findFirst({
          where: { username: { equals: usernameTrim, mode: 'insensitive' } },
          select: {
            id: true,
            username: true,
            password: true,
            firstName: true,
            lastName: true,
            profilePicture: true,
            role: true,
            permissions: true,
            lastLogin: true,
            createdAt: true,
          },
        });
        if (user) console.log(`[auth] Found user by case-insensitive match id=${user.id}`);
      } catch (e) {
        // Ignore errors from case-insensitive query on older DBs
      }
    }

    if (!user) {
      console.warn(`[auth] User not found for username="${username}"`);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    console.log(`[auth] Found user id=${user.id}, attempting password verification`);
    let passwordValid = false;
    try {
      // Try bcrypt compare first (works for hashed passwords)
      passwordValid = await bcrypt.compare(password, user.password);
    } catch (e) {
      // If bcrypt compare fails (e.g. stored value not a bcrypt hash), fallback to plain equality
      passwordValid = user.password === password;
    }

    if (!passwordValid) {
      console.warn(`[auth] Invalid password for user id=${user.id}`);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const activeSessionId = require('crypto').randomUUID();

    // Update lastLogin timestamp and activeSessionId
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { 
        lastLogin: new Date(),
        activeSessionId
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        profilePicture: true,
        role: true,
        permissions: true,
        lastLogin: true,
        activeSessionId: true,
        createdAt: true,
      },
    });

    // Return user data (excluding password)
    console.log(`[auth] ✅ Login successful for user="${updatedUser.username}" (id=${updatedUser.id})`);
    res.json(updatedUser);
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify password endpoint (for delete confirmation)
router.post('/verify-password', async (req: Request, res: Response) => {
  try {
    const { username, password, currentUserId } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        password: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Check if user is trying to use their own credentials (only for authorization, not password change)
    if (currentUserId && currentUserId !== 'password-change-verification' && user.id === currentUserId) {
      return res.status(403).json({ error: 'You cannot use your own credentials for authorization' });
    }

    // Verify password
    const isBcryptHash = user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$');
    const passwordValid = isBcryptHash
      ? await bcrypt.compare(password, user.password)
      : user.password === password;

    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Only superadmin or developer can authorize deletions (skip this check for password change verification)
    if (currentUserId && currentUserId !== 'password-change-verification' && user.role !== 'superadmin' && user.role !== 'developer') {
      return res.status(403).json({ error: 'Only Super Admin or Developer can authorize this action' });
    }

    // Return one-time approval token with user info (excluding password)
    const { password: strippedPassword, ...userWithoutPassword } = user;
    void strippedPassword;
    const approvalToken = issueSuperadminApprovalToken(user);

    res.json({ 
      valid: true, 
      user: userWithoutPassword,
      approvalToken,
    });
  } catch (error) {
    console.error('Error verifying password:', error);
    res.status(500).json({ error: 'Password verification failed' });
  }
});

// Upload profile picture
router.post('/:id/profile-picture', uploadProfilePicture.single('profilePicture'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get user to check if they have an existing profile picture
    const user = await prisma.user.findUnique({
      where: { id },
      select: { profilePicture: true },
    });

    if (!user) {
      // Delete uploaded file if user not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete old profile picture if exists
    if (user.profilePicture) {
      const oldFilePath = path.join(getProfilePicturesDir(), path.basename(user.profilePicture));
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Generate URL for the uploaded file
    const profilePictureUrl = `/uploads/profile-pictures/${req.file.filename}`;

    // Update user with new profile picture
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { profilePicture: profilePictureUrl },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        profilePicture: true,
        role: true,
        permissions: true,
      },
    });

    res.json({ profilePicture: updatedUser.profilePicture });
  } catch (error: any) {
    console.error('Error uploading profile picture:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: error.message || 'Failed to upload profile picture' });
  }
});

// Remove profile picture
router.delete('/:id/profile-picture', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get user to check if they have a profile picture
    const user = await prisma.user.findUnique({
      where: { id },
      select: { profilePicture: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete profile picture file if exists
    if (user.profilePicture) {
      const filePath = path.join(getProfilePicturesDir(), path.basename(user.profilePicture));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Update user to remove profile picture
    await prisma.user.update({
      where: { id },
      data: { profilePicture: null },
    });

    res.json({ message: 'Profile picture removed successfully' });
  } catch (error) {
    console.error('Error removing profile picture:', error);
    res.status(500).json({ error: 'Failed to remove profile picture' });
  }
});

export default router;
