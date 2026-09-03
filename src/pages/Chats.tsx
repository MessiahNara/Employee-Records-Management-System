import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAuthState } from '../utils/mockAuth';
import api from '../services/api';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useToast } from '../contexts/ToastContext';
import { MdSend, MdForum, MdAdd, MdClose, MdSearch, MdDelete, MdWarning, MdGroup } from 'react-icons/md';
import './Chats.css';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  content: string;
  read: boolean;
  createdAt: string;
}

interface UserContact {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  profilePicture?: string;
  lastActive?: string;
  isGroup?: boolean;
  creatorId?: string;
  creatorName?: string;
  members?: UserContact[];
  lastMessage?: {
    content: string;
    createdAt: string;
    senderId: string;
    senderName?: string;
  } | null;
}

function Chats() {
  const currentUser = getAuthState();
  const { showToast } = useToast();

  const isAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // Chat States
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const ACTIVE_CHAT_KEY = 'erms_active_chat_contact';
  const RECENT_CONTACTS_KEY = 'erms_cached_recent_contacts';

  // Users & Contacts States (Restored from localStorage so inbox conversation is never lost on navigation)
  const [recentContacts, setRecentContacts] = useState<UserContact[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_CONTACTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [allUsers, setAllUsers] = useState<UserContact[]>([]);
  const [activeContact, setActiveContact] = useState<UserContact | null>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_CHAT_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // UI States
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Group Chat Creation States
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [groupWarning, setGroupWarning] = useState('');
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [showMembersInfoModal, setShowMembersInfoModal] = useState(false);
  const [newMemberSelection, setNewMemberSelection] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeContactIdRef = useRef<string | null>(null);

  // Keep track of active contact ID for async fetches and persist to localStorage
  useEffect(() => {
    activeContactIdRef.current = activeContact ? activeContact.id : null;
    if (activeContact) {
      localStorage.setItem(ACTIVE_CHAT_KEY, JSON.stringify(activeContact));
    } else {
      localStorage.removeItem(ACTIVE_CHAT_KEY);
    }
  }, [activeContact]);

  const loadAllUsers = async () => {
    try {
      const users = await api.user.getAll();
      const otherUsers = (Array.isArray(users) ? users : []).filter((u: any) => u.id !== currentUser?.id);
      setAllUsers(otherUsers);
    } catch (err) {
      console.error('Failed to load system users:', err);
    }
  };

  // 1. Initial Load of all users (for adding new chats)
  useEffect(() => {
    loadAllUsers();
  }, [currentUser?.id]);

  const handleOpenAddModal = () => {
    loadAllUsers();
    setShowAddUserModal(true);
    setIsGroupMode(false);
    setGroupName('');
    setSelectedMemberIds([]);
    setUserSearchQuery('');
    setGroupWarning('');
  };

  // 2. Poll for unread counts and recent contacts list (Preserving local opened contacts)
  useEffect(() => {
    let isMounted = true;

    const fetchSidebarData = async () => {
      try {
        const [recent, unread] = await Promise.all([
          api.chats.getRecentContacts(),
          api.chats.getUnreadCounts(),
        ]);
        if (isMounted) {
          setRecentContacts((prev) => {
            const map = new Map<string, UserContact>();

            // First add server contacts and groups
            (recent || []).forEach((c) => map.set(c.id, c));

            // Preserve local/cached contacts so conversations without messages yet are not lost
            prev.forEach((c) => {
              if (!map.has(c.id)) {
                map.set(c.id, c);
              }
            });

            // If active contact is set, preserve it in the list
            if (activeContact && !map.has(activeContact.id)) {
              map.set(activeContact.id, activeContact);
            }

            const combined = Array.from(map.values());
            try {
              localStorage.setItem(RECENT_CONTACTS_KEY, JSON.stringify(combined));
            } catch (e) {
              // ignore quota
            }
            return combined;
          });
          setUnreadCounts(unread || {});
        }
      } catch (err) {
        console.error('Failed to poll sidebar data:', err);
      }
    };

    fetchSidebarData();
    const interval = setInterval(fetchSidebarData, 30000);
    window.addEventListener('chatsUpdated', fetchSidebarData);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('chatsUpdated', fetchSidebarData);
    };
  }, [activeContact]);

  // 3. Load and poll conversation history for active contact
  useEffect(() => {
    if (!activeContact) {
      setMessages([]);
      return;
    }

    const currentTargetId = activeContact.id;
    let isMounted = true;
    let isFirstLoad = true;

    const fetchMessages = async () => {
      if (isFirstLoad) {
        setMessages([]);
        setIsLoadingMessages(true);
      }
      try {
        const data = await api.chats.getMessages(currentTargetId);
        // Ensure the response belongs to the currently active contact
        if (isMounted && activeContactIdRef.current === currentTargetId) {
          setMessages(data);

          // Clear local unread count for this active contact
          setUnreadCounts((prev) => {
            const updated = { ...prev };
            delete updated[currentTargetId];
            return updated;
          });
        }
      } catch (err) {
        console.error('Failed to load messages for contact:', err);
      } finally {
        if (isMounted && isFirstLoad && activeContactIdRef.current === currentTargetId) {
          setIsLoadingMessages(false);
          isFirstLoad = false;
        }
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 30000);
    window.addEventListener('chatsUpdated', fetchMessages);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('chatsUpdated', fetchMessages);
    };
  }, [activeContact?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending || !activeContact) return;

    const messageText = inputText.trim();
    const targetContact = activeContact;
    setInputText('');
    setIsSending(true);

    try {
      const newMessage = await api.chats.sendMessage(targetContact.id, messageText);
      
      // Update messages immediately if still on this contact
      if (activeContactIdRef.current === targetContact.id) {
        setMessages((prev) => [...prev, newMessage]);
      }

      // Ensure this contact appears in the recent contacts list immediately
      setRecentContacts((prev) => {
        if (prev.some((c) => c.id === targetContact.id)) return prev;
        return [targetContact, ...prev];
      });
    } catch (err: any) {
      console.error('Failed to send message:', err);
      showToast(err.message || 'Failed to send message. Please try again.', 'error');
      setInputText(messageText);
    } finally {
      setIsSending(false);
    }
  };

  // Start new conversation from modal
  const handleSelectUser = (user: UserContact) => {
    setActiveContact(user);
    setShowAddUserModal(false);
    setUserSearchQuery('');
    setIsGroupMode(false);
    setSelectedMemberIds([]);
    setGroupName('');

    // Add to recent contacts list if not present
    setRecentContacts((prev) => {
      if (prev.some((c) => c.id === user.id)) return prev;
      return [user, ...prev];
    });
  };

  // Create Group Chat (Requires Admin Approval)
  const handleCreateGroupChat = async () => {
    if (!groupName.trim()) {
      setGroupWarning('Please enter a group chat name.');
      return;
    }
    if (selectedMemberIds.length < 1) {
      setGroupWarning('Please select at least 1 other member for a group chat.');
      return;
    }

    setGroupWarning('');

    const selectedUsers = allUsers.filter((u) => selectedMemberIds.includes(u.id));
    const memberNames = selectedUsers.map((u) => `${u.firstName} ${u.lastName}`.trim()).join(', ');
    const myName = `${currentUser?.firstName || 'User'} ${currentUser?.lastName || ''}`.trim();
    const allGroupMemberIds = Array.from(new Set([currentUser?.id || '', ...selectedMemberIds]));

    try {
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
        action: 'create_group_chat',
        entityType: 'group_chat',
        entityId: `group_${Date.now()}`,
        entityName: groupName.trim(),
        payload: {
          groupName: groupName.trim(),
          selectedMemberIds: allGroupMemberIds,
          memberNames,
          creatorName: myName,
        },
      });

      setShowAddUserModal(false);
      setIsGroupMode(false);
      setGroupName('');
      setSelectedMemberIds([]);
      showToast('⏳ Group chat request submitted! It will appear in your inbox once approved by an administrator.', 'info');
    } catch (err: any) {
      showToast(`Failed to submit group chat request: ${err.message}`, 'error');
    }
  };

  // Add members to existing group
  const handleAddGroupMembers = async (newMemberIds: string[]) => {
    if (!activeContact || !activeContact.isGroup) return;

    try {
      const updatedGroup = await api.chats.addGroupMembers(activeContact.id, newMemberIds);
      const addedUsers = allUsers.filter((u) => newMemberIds.includes(u.id));
      const existingMembers = activeContact.members || [];
      const updatedMembers = [...existingMembers, ...addedUsers];

      const updatedContact: UserContact = {
        ...activeContact,
        members: updatedMembers,
      };

      setActiveContact(updatedContact);
      setRecentContacts((prev) => prev.map((c) => (c.id === updatedContact.id ? updatedContact : c)));
      setShowAddMembersModal(false);
      setNewMemberSelection([]);
      showToast(`Added ${addedUsers.length} member(s) to group!`, 'success');
    } catch (err: any) {
      showToast(`Failed to add members: ${err.message}`, 'error');
    }
  };

  // Remove member from group
  const handleRemoveGroupMember = async (memberId: string) => {
    if (!activeContact || !activeContact.isGroup) return;

    try {
      await api.chats.removeGroupMember(activeContact.id, memberId);
      const updatedMembers = (activeContact.members || []).filter((m) => m.id !== memberId);

      const updatedContact: UserContact = {
        ...activeContact,
        members: updatedMembers,
      };

      setActiveContact(updatedContact);
      setRecentContacts((prev) => prev.map((c) => (c.id === updatedContact.id ? updatedContact : c)));
      showToast('Member removed from group', 'info');
    } catch (err: any) {
      showToast(`Failed to remove member: ${err.message}`, 'error');
    }
  };

  // Delete conversation or group chat
  const handleDeleteConversation = async () => {
    if (!activeContact || isDeleting) return;
    setIsDeleting(true);
    try {
      await api.chats.deleteConversation(activeContact.id);
      showToast(activeContact.isGroup ? 'Group chat left/removed successfully.' : 'Conversation deleted successfully.', 'success');

      // Remove deleted contact from recent contacts list
      setRecentContacts((prev) => {
        const updated = prev.filter((c) => c.id !== activeContact.id);
        try {
          localStorage.setItem(RECENT_CONTACTS_KEY, JSON.stringify(updated));
        } catch (e) {
          // ignore
        }
        return updated;
      });
      try {
        localStorage.removeItem(ACTIVE_CHAT_KEY);
      } catch (e) {
        // ignore
      }
      setActiveContact(null);
      setMessages([]);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      showToast('Failed to delete conversation.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Helpers
  const checkIsOnline = (lastActiveString: string | undefined) => {
    if (!lastActiveString) return false;
    try {
      const lastActive = new Date(lastActiveString).getTime();
      const now = new Date().getTime();
      return now - lastActive < 15000;
    } catch {
      return false;
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getMessageDateLabel = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      } else {
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
        return date.toLocaleDateString([], options);
      }
    } catch {
      return '';
    }
  };

  const formatSidebarTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    } catch {
      return '';
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase() || 'U';
  };

  const formatRole = (role: string) => {
    if (!role) return 'Staff';
    if (role.toLowerCase() === 'superadmin') return 'Super Admin';
    if (role.toLowerCase() === 'admin') return 'Admin';
    if (role.toLowerCase() === 'developer') return 'Developer';
    return 'Staff';
  };

  // Filter contacts by search query
  const filteredRecentContacts = recentContacts.filter((c) => {
    if (!sidebarSearchQuery.trim()) return true;
    const query = sidebarSearchQuery.toLowerCase();
    const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
    return (
      c.firstName.toLowerCase().includes(query) ||
      c.lastName.toLowerCase().includes(query) ||
      fullName.includes(query) ||
      c.username.toLowerCase().includes(query)
    );
  });

  // Filter all users for modal
  const filteredUsers = allUsers.filter((u) => {
    if (!userSearchQuery.trim()) return true;
    const query = userSearchQuery.toLowerCase();
    const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
    return (
      u.firstName.toLowerCase().includes(query) ||
      u.lastName.toLowerCase().includes(query) ||
      fullName.includes(query) ||
      u.username.toLowerCase().includes(query)
    );
  });

  return (
    <div className="chats-page">
      <div className="chats-page__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <MdForum className="chats-page__title-icon" />
          <div>
            <h1 className="chats-page__title">Internal Messages</h1>
            <p className="chats-page__subtitle">Secure communication and group discussions</p>
          </div>
        </div>
      </div>

      <div className="chats-container">
        {/* Left Side: Recent Contacts */}
        <Card className="chats-sidebar">
          <div className="chats-sidebar__header">
            <h3 className="chats-sidebar__title">Conversations</h3>
            <button
              className="chats-sidebar__add-btn"
              onClick={handleOpenAddModal}
              title="New Chat or Group"
              type="button"
            >
              <MdAdd size={20} />
            </button>
          </div>

          <div className="chats-sidebar__search">
            <MdSearch className="chats-sidebar__search-icon" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={sidebarSearchQuery}
              onChange={(e) => setSidebarSearchQuery(e.target.value)}
            />
          </div>

          <div className="chats-sidebar__list">
            {filteredRecentContacts.length === 0 ? (
              <div className="chats-sidebar__empty">
                <p>No conversations found.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenAddModal}
                  style={{ marginTop: '8px', color: 'var(--color-primary)' }}
                >
                  Start a conversation
                </Button>
              </div>
            ) : (
              filteredRecentContacts.map((contact) => {
                const isActive = activeContact?.id === contact.id;
                const unreadCount = unreadCounts[contact.id] || 0;
                const lastMsgText = contact.lastMessage ? contact.lastMessage.content : '';
                const lastMsgTime = contact.lastMessage ? formatSidebarTime(contact.lastMessage.createdAt) : '';

                return (
                  <div
                    key={contact.id}
                    className={`contact-item ${isActive ? 'contact-item--active' : ''}`}
                    onClick={() => {
                      if (activeContact?.id !== contact.id) {
                        setMessages([]);
                        setActiveContact(contact);
                      }
                    }}
                  >
                    <div className="contact-item__avatar-container">
                      <div className={`contact-item__avatar ${contact.isGroup ? 'contact-item__avatar--group' : ''}`}>
                        {contact.isGroup ? (
                          <MdGroup size={22} style={{ color: '#ffffff' }} />
                        ) : contact.profilePicture ? (
                          <img src={contact.profilePicture} alt={contact.firstName} className="chat-avatar-img" />
                        ) : (
                          getInitials(contact.firstName, contact.lastName)
                        )}
                      </div>
                      {!contact.isGroup && checkIsOnline(contact.lastActive) && <span className="online-indicator" />}
                    </div>
                    <div className="contact-item__info">
                      <div className="contact-item__name-row">
                        <span className="contact-item__name">
                          {contact.firstName} {contact.lastName}
                        </span>
                        {lastMsgTime && <span className="contact-item__time">{lastMsgTime}</span>}
                      </div>
                      <div className="contact-item__detail-row">
                        <span className={`contact-item__preview ${unreadCount > 0 ? 'contact-item__preview--unread' : ''}`}>
                          {lastMsgText || (contact.isGroup ? 'Group Chat' : formatRole(contact.role))}
                        </span>
                        {unreadCount > 0 && <span className="contact-item__badge">{unreadCount}</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Right Side: Message Thread */}
        <Card className="chats-main">
          {activeContact ? (
            <>
              {/* Active Chat Header */}
              <div className="chats-main__header">
                <div className="chats-main__header-info">
                  <div className="chats-main__avatar-container">
                    <div className={`chats-main__contact-avatar ${activeContact.isGroup ? 'chats-main__contact-avatar--group' : ''}`}>
                      {activeContact.isGroup ? (
                        <MdGroup size={24} style={{ color: '#ffffff' }} />
                      ) : activeContact.profilePicture ? (
                        <img src={activeContact.profilePicture} alt={activeContact.firstName} className="chat-avatar-img" />
                      ) : (
                        getInitials(activeContact.firstName, activeContact.lastName)
                      )}
                    </div>
                    {!activeContact.isGroup && checkIsOnline(activeContact.lastActive) && <span className="online-indicator" />}
                  </div>
                  <div>
                    <h3 className="chats-main__contact-name">
                      {activeContact.firstName} {activeContact.lastName}
                    </h3>
                    <span className="chats-main__contact-role">
                      {activeContact.isGroup ? (
                        <>
                          Group Chat • {activeContact.members?.length || 0} members • Created by <strong>{activeContact.creatorName || 'Admin'}</strong>
                        </>
                      ) : (
                        <>
                          {formatRole(activeContact.role)} • {checkIsOnline(activeContact.lastActive) ? 'Online' : 'Offline'}
                        </>
                      )}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {activeContact.isGroup && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowMembersInfoModal(true)}
                        title="View Group Members"
                        style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                      >
                        Members ({activeContact.members?.length || 0})
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setNewMemberSelection([]);
                          setShowAddMembersModal(true);
                        }}
                        title="Add Member to Group"
                        style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                      >
                        <MdAdd size={16} /> Add Member
                      </Button>
                    </>
                  )}
                  <button
                    className="chats-main__delete-btn"
                    onClick={() => setShowDeleteConfirm(true)}
                    title={activeContact.isGroup ? 'Leave / Delete Group Chat' : 'Delete Conversation'}
                  >
                    <MdDelete size={20} />
                  </button>
                </div>
              </div>

              {/* Chat Thread */}
              <div className="chat-messages">
                {isLoadingMessages ? (
                  <div className="chat-messages__loading">
                    <div className="chat-card__spinner"></div>
                    <p>Loading conversation...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-messages__empty">
                    <MdForum className="chat-messages__empty-icon" />
                    <p>
                      {activeContact.isGroup
                        ? `This is the start of the "${activeContact.firstName}" group conversation.`
                        : `This is the start of your private conversation with ${activeContact.firstName}.`}
                    </p>
                  </div>
                ) : (
                  (() => {
                    let lastDateLabel = '';
                    return messages.map((msg) => {
                      const isSystem = msg.senderId === 'system';
                      const isOwn = msg.senderId === currentUser?.id;
                      const msgDateLabel = getMessageDateLabel(msg.createdAt);
                      const showDateDivider = msgDateLabel !== lastDateLabel;
                      if (showDateDivider) {
                        lastDateLabel = msgDateLabel;
                      }
                      return (
                        <React.Fragment key={msg.id}>
                          {showDateDivider && (
                            <div className="chat-messages__date-divider">
                              <span className="chat-messages__date-label">{msgDateLabel}</span>
                            </div>
                          )}
                          {isSystem ? (
                            <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                              <span
                                style={{
                                  backgroundColor: 'var(--bg-tertiary)',
                                  color: 'var(--text-secondary)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '16px',
                                  padding: '4px 14px',
                                  fontSize: '0.78rem',
                                  fontWeight: 500,
                                  textAlign: 'center',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                }}
                              >
                                {msg.content}
                              </span>
                            </div>
                          ) : (
                            <div className={`chat-message ${isOwn ? 'chat-message--own' : 'chat-message--other'}`}>
                              <div className="chat-message__body">
                                {!isOwn && activeContact.isGroup && (
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      color: '#4f46e5',
                                      marginBottom: '2px',
                                      display: 'block',
                                    }}
                                  >
                                    {msg.senderName}
                                  </span>
                                )}
                                <div className="chat-message__bubble">
                                  <p className="chat-message__text">{msg.content}</p>
                                  <span className="chat-message__time">{formatTime(msg.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    });
                  })()
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Form */}
              <form onSubmit={handleSendMessage} className="chat-input-form">
                <input
                  type="text"
                  className="chat-input-form__field"
                  placeholder={activeContact.isGroup ? `Message ${activeContact.firstName}...` : 'Type a message...'}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  maxLength={1000}
                  disabled={isSending}
                />
                <Button
                  type="submit"
                  variant="primary"
                  className="chat-input-form__btn"
                  disabled={!inputText.trim() || isSending}
                >
                  <MdSend size={18} />
                </Button>
              </form>
            </>
          ) : (
            <div className="chats-main__empty">
              <MdForum size={64} style={{ color: 'var(--text-tertiary)', marginBottom: '16px', opacity: 0.4 }} />
              <h3>No Conversation Selected</h3>
              <p style={{ marginBottom: '16px' }}>Select a contact from the panel or start a new conversation.</p>
              <Button variant="primary" size="md" onClick={handleOpenAddModal} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <MdAdd size={20} /> Start a Conversation
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Add User / Create Group Chat Modal */}
      {showAddUserModal &&
        createPortal(
          <div className="chat-modal-overlay" onClick={() => setShowAddUserModal(false)}>
            <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="chat-modal__header">
                <h3>{isGroupMode ? 'Create Group Chat' : 'Start New Conversation'}</h3>
                <button className="chat-modal__close" onClick={() => setShowAddUserModal(false)}>
                  <MdClose size={22} />
                </button>
              </div>

              {/* Mode Switcher Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <button
                  type="button"
                  onClick={() => setIsGroupMode(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontWeight: !isGroupMode ? 700 : 500,
                    color: !isGroupMode ? 'var(--color-primary)' : 'var(--text-secondary)',
                    borderBottom: !isGroupMode ? '2px solid var(--color-primary)' : '2px solid transparent',
                    background: 'none',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Direct Message
                </button>
                <button
                  type="button"
                  onClick={() => setIsGroupMode(true)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontWeight: isGroupMode ? 700 : 500,
                    color: isGroupMode ? 'var(--color-primary)' : 'var(--text-secondary)',
                    borderBottom: isGroupMode ? '2px solid var(--color-primary)' : '2px solid transparent',
                    background: 'none',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Create Group Chat
                </button>
              </div>

              {isGroupMode && (
                <div style={{ padding: '12px 16px 0 16px' }}>
                  <input
                    type="text"
                    placeholder="Enter Group Name (e.g. HR Team, Appraisal Committee)..."
                    value={groupName}
                    onChange={(e) => {
                      setGroupName(e.target.value);
                      if (groupWarning) setGroupWarning('');
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              <div className="chat-modal__search">
                <MdSearch className="chat-modal__search-icon" />
                <input
                  type="text"
                  placeholder={isGroupMode ? 'Filter members to add...' : 'Search user name or username...'}
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                />
              </div>

              <div className="chat-modal__body">
                {filteredUsers.length === 0 ? (
                  <div className="chat-modal__empty">
                    <p>No users found matching your search.</p>
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isChecked = selectedMemberIds.includes(user.id);
                    return (
                      <div
                        key={user.id}
                        className="chat-modal__user-item"
                        onClick={() => {
                          if (isGroupMode) {
                            if (groupWarning) setGroupWarning('');
                            if (isChecked) {
                              setSelectedMemberIds((prev) => prev.filter((id) => id !== user.id));
                            } else {
                              setSelectedMemberIds((prev) => [...prev, user.id]);
                            }
                          } else {
                            handleSelectUser(user);
                          }
                        }}
                      >
                        {isGroupMode && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#3b82f6' }}
                          />
                        )}
                        <div className="chat-modal__user-avatar-container">
                          <div className="chat-modal__user-avatar">
                            {user.profilePicture ? (
                              <img src={user.profilePicture} alt={user.firstName} className="chat-avatar-img" />
                            ) : (
                              getInitials(user.firstName, user.lastName)
                            )}
                          </div>
                          {checkIsOnline(user.lastActive) && <span className="online-indicator" />}
                        </div>
                        <div className="chat-modal__user-info" style={{ flex: 1 }}>
                          <div className="chat-modal__user-name">
                            {user.firstName} {user.lastName}
                          </div>
                          <div className="chat-modal__user-meta">
                            @{user.username} • {formatRole(user.role)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {isGroupMode && (
                <div
                  style={{
                    borderTop: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {groupWarning && (
                    <div
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#fef2f2',
                        borderBottom: '1px solid #fee2e2',
                        color: '#dc2626',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <MdWarning size={16} style={{ flexShrink: 0 }} />
                      <span>{groupWarning}</span>
                    </div>
                  )}
                  <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {selectedMemberIds.length} member(s) selected
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsGroupMode(false);
                          setGroupWarning('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" onClick={handleCreateGroupChat}>
                        Submit Request
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Delete Conversation / Group Chat Confirmation Modal */}
      {showDeleteConfirm &&
        activeContact &&
        createPortal(
          <div className="chat-modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
            <div className="chat-modal chat-modal--confirm" onClick={(e) => e.stopPropagation()}>
              <div className="chat-modal__header">
                <h3>{activeContact.isGroup ? 'Leave / Delete Group Chat' : 'Delete Conversation'}</h3>
                <button className="chat-modal__close" onClick={() => setShowDeleteConfirm(false)}>
                  <MdClose size={22} />
                </button>
              </div>
              <div className="chat-modal__body text-center">
                <p className="chat-modal__confirm-msg">
                  {activeContact.isGroup ? (
                    <>
                      Are you sure you want to leave / remove the group chat <strong>"{activeContact.firstName}"</strong>?
                    </>
                  ) : (
                    <>
                      Are you sure you want to delete your conversation with{' '}
                      <strong>
                        {activeContact.firstName} {activeContact.lastName}
                      </strong>
                      ?
                    </>
                  )}
                </p>
                <p className="chat-modal__warn-text">
                  {activeContact.isGroup
                    ? 'This will remove the group chat from your conversation list.'
                    : 'This action will delete conversation messages for your account.'}
                </p>
                <div className="chat-modal__actions">
                  <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={handleDeleteConversation} disabled={isDeleting}>
                    {isDeleting ? 'Processing...' : activeContact.isGroup ? 'Leave Group' : 'Delete'}
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Group Members List Modal */}
      {showMembersInfoModal &&
        activeContact &&
        activeContact.isGroup &&
        createPortal(
          <div className="chat-modal-overlay" onClick={() => setShowMembersInfoModal(false)}>
            <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="chat-modal__header">
                <h3>Group Members — {activeContact.firstName}</h3>
                <button className="chat-modal__close" onClick={() => setShowMembersInfoModal(false)}>
                  <MdClose size={22} />
                </button>
              </div>
              <div className="chat-modal__body">
                <div
                  style={{
                    padding: '8px 16px',
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    fontSize: '0.85rem',
                  }}
                >
                  Created by: <strong>{activeContact.creatorName || 'Admin'}</strong>
                </div>
                {(activeContact.members || []).map((m) => (
                  <div key={m.id} className="chat-modal__user-item" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="chat-modal__user-avatar-container">
                        <div className="chat-modal__user-avatar">
                          {m.profilePicture ? (
                            <img src={m.profilePicture} alt={m.firstName} className="chat-avatar-img" />
                          ) : (
                            getInitials(m.firstName, m.lastName)
                          )}
                        </div>
                        {checkIsOnline(m.lastActive) && <span className="online-indicator" />}
                      </div>
                      <div className="chat-modal__user-info">
                        <div className="chat-modal__user-name">
                          {m.firstName} {m.lastName} {m.id === currentUser?.id ? '(You)' : ''}
                        </div>
                        <div className="chat-modal__user-meta">
                          @{m.username} • {formatRole(m.role)}
                        </div>
                      </div>
                    </div>
                    {m.id !== currentUser?.id && (isAdmin || activeContact.creatorId === currentUser?.id) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveGroupMember(m.id)}
                        title="Remove member from group"
                        style={{ color: '#ef4444', fontSize: '0.75rem', padding: '2px 8px' }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Add New Members to Group Modal */}
      {showAddMembersModal &&
        activeContact &&
        activeContact.isGroup &&
        createPortal(
          <div className="chat-modal-overlay" onClick={() => setShowAddMembersModal(false)}>
            <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="chat-modal__header">
                <h3>Add Members to {activeContact.firstName}</h3>
                <button className="chat-modal__close" onClick={() => setShowAddMembersModal(false)}>
                  <MdClose size={22} />
                </button>
              </div>
              <div className="chat-modal__body">
                {allUsers
                  .filter((u) => !(activeContact.members || []).some((m) => m.id === u.id))
                  .map((u) => {
                    const isChecked = newMemberSelection.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        className="chat-modal__user-item"
                        onClick={() => {
                          if (isChecked) {
                            setNewMemberSelection((prev) => prev.filter((id) => id !== u.id));
                          } else {
                            setNewMemberSelection((prev) => [...prev, u.id]);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#3b82f6' }}
                        />
                        <div className="chat-modal__user-avatar-container">
                          <div className="chat-modal__user-avatar">
                            {u.profilePicture ? (
                              <img src={u.profilePicture} alt={u.firstName} className="chat-avatar-img" />
                            ) : (
                              getInitials(u.firstName, u.lastName)
                            )}
                          </div>
                        </div>
                        <div className="chat-modal__user-info" style={{ flex: 1 }}>
                          <div className="chat-modal__user-name">
                            {u.firstName} {u.lastName}
                          </div>
                          <div className="chat-modal__user-meta">
                            @{u.username} • {formatRole(u.role)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div
                style={{
                  padding: '12px 16px',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {newMemberSelection.length} member(s) selected
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddMembersModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={newMemberSelection.length === 0}
                    onClick={() => handleAddGroupMembers(newMemberSelection)}
                  >
                    Add Selected Members
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default Chats;
