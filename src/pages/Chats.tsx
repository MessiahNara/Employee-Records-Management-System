import React, { useState, useEffect, useRef } from 'react';
import { getAuthState } from '../utils/mockAuth';
import api from '../services/api';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useToast } from '../contexts/ToastContext';
import { MdSend, MdForum, MdAdd, MdClose, MdSearch, MdDelete } from 'react-icons/md';
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
  lastMessage?: {
    content: string;
    createdAt: string;
    senderId: string;
  } | null;
}

function Chats() {
  const currentUser = getAuthState();
  const { showToast } = useToast();

  // Chat States
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Users & Contacts States
  const [recentContacts, setRecentContacts] = useState<UserContact[]>([]);
  const [allUsers, setAllUsers] = useState<UserContact[]>([]);
  const [activeContact, setActiveContact] = useState<UserContact | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // UI States
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load of all users (for adding new chats)
  useEffect(() => {
    const loadAllUsers = async () => {
      try {
        const users = await api.user.getAll();
        // Exclude currently logged-in user
        const otherUsers = users.filter((u: any) => u.id !== currentUser?.id);
        setAllUsers(otherUsers);
      } catch (err) {
        console.error('Failed to load system users:', err);
      }
    };
    loadAllUsers();
  }, [currentUser?.id]);

  // 2. Poll for unread counts and recent contacts list
  useEffect(() => {
    let isMounted = true;

    const fetchSidebarData = async () => {
      try {
        const [recent, unread] = await Promise.all([
          api.chats.getRecentContacts(),
          api.chats.getUnreadCounts()
        ]);
        if (isMounted) {
          setRecentContacts(recent);
          setUnreadCounts(unread);
        }
      } catch (err) {
        console.error('Failed to poll sidebar data:', err);
      }
    };

    fetchSidebarData();
    const interval = setInterval(fetchSidebarData, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // 3. Poll and Load conversation history for active contact
  useEffect(() => {
    if (!activeContact) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    let isFirstLoad = true;

    const fetchMessages = async () => {
      if (isFirstLoad) {
        setIsLoadingMessages(true);
      }
      try {
        const data = await api.chats.getMessages(activeContact.id);
        if (isMounted) {
          setMessages(data);

          // Clear local unread counts for this active contact
          setUnreadCounts((prev) => {
            const updated = { ...prev };
            delete updated[activeContact.id];
            return updated;
          });
        }
      } catch (err) {
        console.error('Failed to load messages for contact:', err);
      } finally {
        if (isMounted && isFirstLoad) {
          setIsLoadingMessages(false);
          isFirstLoad = false;
        }
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeContact]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending || !activeContact) return;

    const messageText = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      const newMessage = await api.chats.sendMessage(activeContact.id, messageText);
      setMessages((prev) => [...prev, newMessage]);

      // Ensure this contact appears in the recent contacts list immediately
      setRecentContacts((prev) => {
        if (prev.some((c) => c.id === activeContact.id)) return prev;
        return [activeContact, ...prev];
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      showToast('Failed to send message. Please try again.', 'error');
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

    // Add to recent contacts list if not present
    setRecentContacts((prev) => {
      if (prev.some((c) => c.id === user.id)) return prev;
      return [user, ...prev];
    });
  };

  const handleDeleteConversation = async () => {
    if (!activeContact || isDeleting) return;
    setIsDeleting(true);
    try {
      await api.chats.deleteConversation(activeContact.id);
      showToast('Conversation deleted successfully.', 'success');
      
      // Remove deleted contact from recent contacts list
      setRecentContacts((prev) => prev.filter((c) => c.id !== activeContact.id));
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
      return (now - lastActive) < 10000;
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

  const getInitials = (first: string, last: string) => {
    return `${first.charAt(0) || ''}${last.charAt(0) || ''}`.toUpperCase() || '?';
  };

  const formatRole = (role: string) => {
    if (role === 'superadmin') return 'Super Admin';
    if (role === 'developer') return 'Dev';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  // Filtered users for Add User Modal
  const filteredUsers = allUsers.filter(u => {
    const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
    const username = u.username.toLowerCase();
    const query = userSearchQuery.toLowerCase();
    return fullName.includes(query) || username.includes(query);
  });

  return (
    <div className="chats-page">
      <div className="chats-page__header">
        <h2 className="chats-page__title">
          <MdForum className="chats-page__title-icon" />
          <span>Internal Messaging</span>
        </h2>
        <p className="chats-page__subtitle">
          Secure, private direct messaging with other staff and administrators.
        </p>
      </div>

      <div className="chats-container">
        {/* Left Side: Message Thread */}
        <Card className="chats-main">
          {activeContact ? (
            <>
              {/* Active Chat Header */}
              <div className="chats-main__header">
                <div className="chats-main__header-info">
                  <div className="chats-main__avatar-container">
                    <div className="chats-main__contact-avatar">
                      {getInitials(activeContact.firstName, activeContact.lastName)}
                    </div>
                    {checkIsOnline(activeContact.lastActive) && <span className="online-indicator" />}
                  </div>
                  <div>
                    <h3 className="chats-main__contact-name">
                      {activeContact.firstName} {activeContact.lastName}
                    </h3>
                    <span className="chats-main__contact-role">
                      {formatRole(activeContact.role)} • {checkIsOnline(activeContact.lastActive) ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
                <button
                  className="chats-main__delete-btn"
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Delete Conversation"
                >
                  <MdDelete size={20} />
                </button>
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
                    <p>This is the start of your private chat history with {activeContact.firstName}.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.senderId === currentUser?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`chat-message ${isOwn ? 'chat-message--own' : 'chat-message--other'}`}
                      >
                        <div className="chat-message__body">
                          <div className="chat-message__bubble">
                            <p className="chat-message__text">{msg.content}</p>
                            <span className="chat-message__time">{formatTime(msg.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Form */}
              <form onSubmit={handleSendMessage} className="chat-input-form">
                <input
                  type="text"
                  className="chat-input-form__field"
                  placeholder="Type a message..."
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
              <p>Select a contact from the panel or click the plus button to start a new chat.</p>
            </div>
          )}
        </Card>

        {/* Right Side: Contacts / Active Chats Sidebar */}
        <Card className="chats-sidebar">
          <div className="chats-sidebar__header">
            <h3>Inbox</h3>
            <button
              className="chats-sidebar__add-btn"
              onClick={() => setShowAddUserModal(true)}
              title="Start a new chat"
            >
              <MdAdd size={20} />
            </button>
          </div>

          <div className="chats-sidebar__list">
            {recentContacts.length === 0 ? (
              <div className="chats-sidebar__empty">
                <p>No active conversations.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddUserModal(true)}
                  style={{ marginTop: '8px' }}
                >
                  <MdAdd size={16} style={{ marginRight: '4px' }} /> Start Chat
                </Button>
              </div>
            ) : (
              recentContacts.map((contact) => {
                const isActive = activeContact?.id === contact.id;
                const unreadCount = unreadCounts[contact.id] || 0;
                const lastMsg = contact.lastMessage;
                const lastMsgTime = lastMsg ? formatTime(lastMsg.createdAt) : '';
                const lastMsgText = lastMsg
                  ? (lastMsg.senderId === currentUser?.id ? 'You: ' : '') + lastMsg.content
                  : '';

                return (
                  <div
                    key={contact.id}
                     className={`contact-item ${isActive ? 'contact-item--active' : ''}`}
                    onClick={() => setActiveContact(contact)}
                  >
                    <div className="contact-item__avatar-container">
                      <div className="contact-item__avatar">
                        {getInitials(contact.firstName, contact.lastName)}
                      </div>
                      {checkIsOnline(contact.lastActive) && <span className="online-indicator" />}
                    </div>
                    <div className="contact-item__info">
                      <div className="contact-item__name-row">
                        <span className="contact-item__name">
                          {contact.firstName} {contact.lastName}
                        </span>
                        {lastMsgTime && (
                          <span className="contact-item__time">
                            {lastMsgTime}
                          </span>
                        )}
                      </div>
                      <div className="contact-item__detail-row">
                        <span className={`contact-item__preview ${unreadCount > 0 ? 'contact-item__preview--unread' : ''}`}>
                          {lastMsgText || formatRole(contact.role)}
                        </span>
                        {unreadCount > 0 && (
                          <span className="contact-item__badge">{unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="chat-modal-overlay" onClick={() => setShowAddUserModal(false)}>
          <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal__header">
              <h3>Start New Conversation</h3>
              <button className="chat-modal__close" onClick={() => setShowAddUserModal(false)}>
                <MdClose size={22} />
              </button>
            </div>

            <div className="chat-modal__search">
              <MdSearch className="chat-modal__search-icon" />
              <input
                type="text"
                placeholder="Search user name or username..."
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
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="chat-modal__user-item"
                    onClick={() => handleSelectUser(user)}
                  >
                    <div className="chat-modal__user-avatar-container">
                      <div className="chat-modal__user-avatar">
                        {getInitials(user.firstName, user.lastName)}
                      </div>
                      {checkIsOnline(user.lastActive) && <span className="online-indicator" />}
                    </div>
                    <div className="chat-modal__user-info">
                      <div className="chat-modal__user-name">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="chat-modal__user-meta">
                        @{user.username} • {formatRole(user.role)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Conversation Confirmation Modal */}
      {showDeleteConfirm && activeContact && (
        <div className="chat-modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="chat-modal chat-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal__header">
              <h3>Delete Conversation</h3>
              <button className="chat-modal__close" onClick={() => setShowDeleteConfirm(false)}>
                <MdClose size={22} />
              </button>
            </div>
            <div className="chat-modal__body text-center">
              <p className="chat-modal__confirm-msg">Are you sure you want to delete your conversation with <strong>{activeContact.firstName} {activeContact.lastName}</strong>?</p>
              <p className="chat-modal__warn-text">This action cannot be undone and will delete all messages for both users.</p>
              <div className="chat-modal__actions">
                <Button
                  variant="secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDeleteConversation}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chats;
