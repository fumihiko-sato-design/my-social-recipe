/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  ExternalLink, 
  LogOut, 
  Search, 
  Link as LinkIcon, 
  Facebook, 
  Youtube, 
  Instagram, 
  Twitter, 
  Video, 
  Heart,
  LayoutGrid,
  Settings,
  Circle,
  Globe,
  Share2,
  Users,
  Copy,
  Check,
  MoreVertical,
  Edit3,
  Star,
  Clock,
  History as HistoryIcon,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  signInAnonymously,
  User 
} from './lib/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  limit
} from 'firebase/firestore';
import { fetchLinkMetadata } from './services/geminiService';
import { SocialLink, Collection, HistoryItem } from './types';
import { cn } from './lib/utils';

// Error Handler helper
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

const PLATFORM_ICONS: Record<string, any> = {
  facebook: Facebook,
  youtube: Youtube,
  instagram: Instagram,
  x: Twitter,
  tiktok: Video,
  other: Globe,
};

const PLATFORM_COLORS: Record<string, string> = {
  facebook: 'text-blue-600 bg-blue-50',
  youtube: 'text-red-600 bg-red-50',
  instagram: 'text-pink-600 bg-pink-50',
  x: 'text-gray-900 bg-gray-50',
  tiktok: 'text-black bg-gray-50',
  other: 'text-indigo-600 bg-indigo-50',
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [currentCollection, setCurrentCollection] = useState<Collection | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'standard' | 'history'>('standard');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLinkTitleValue, setEditLinkTitleValue] = useState('');
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editCollectionNameValue, setEditCollectionNameValue] = useState('');
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(null);
  const [copyingLinkId, setCopyingLinkId] = useState<string | null>(null);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const categorySelectorRef = useRef<HTMLDivElement>(null);

  // Scroll to new category input
  useEffect(() => {
    if (isCreatingCollection && categorySelectorRef.current) {
      categorySelectorRef.current.scrollTo({
        left: categorySelectorRef.current.scrollWidth,
        behavior: 'smooth'
      });
    }
  }, [isCreatingCollection]);
  const [newCollectionName, setNewCollectionName] = useState('');

  const categories = [
    { id: 'facebook', label: 'Facebook', color: 'bg-blue-400' },
    { id: 'tiktok', label: 'TikTok', color: 'bg-pink-400' },
    { id: 'instagram', label: 'Instagram', color: 'bg-rose-400' },
    { id: 'youtube', label: 'YouTube', color: 'bg-red-500' },
    { id: 'x', label: 'X / Twitter', color: 'bg-slate-900' },
  ];

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setInitialLoading(false);
    });
    return unsubscribe;
  }, []);

  // Shared Link Detection & Collection Initialization
  useEffect(() => {
    if (!user) return;

    const init = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sharedId = urlParams.get('c');

      if (sharedId) {
        try {
          const colRef = doc(db, 'collections', sharedId);
          const colSnap = await getDoc(colRef);
          if (colSnap.exists()) {
            const colData = { id: colSnap.id, ...colSnap.data() } as Collection;
            if (colData.isPublic || colData.ownerId === user.uid || colData.collaborators.includes(user.uid)) {
              setCurrentCollection(colData);
            }
          }
        } catch (e) {
          console.error("Error loading shared collection", e);
        }
      }

      const q = query(
        collection(db, 'collections'),
        where('ownerId', '==', user.uid)
      );
      
      const unsubscribeCols = onSnapshot(q, async (snap) => {
        const fetchedCols = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Collection[];
        
        const q2 = query(
          collection(db, 'collections'),
          where('collaborators', 'array-contains', user.uid)
        );
        const colSnap = await getDocs(q2);
        const collaboratorCols = colSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Collection[];
        
        const allCols = [];
        const seen = new Set();
        [...fetchedCols, ...collaboratorCols].forEach(c => {
          if (!seen.has(c.id)) {
            allCols.push(c);
            seen.add(c.id);
          }
        });
        
        setCollections(allCols);

        if (allCols.length === 0) {
          const defaultCol = {
            name: 'レシピ動画',
            ownerId: user.uid,
            collaborators: [],
            isPublic: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          const docRef = await addDoc(collection(db, 'collections'), defaultCol);
          setCurrentCollection({ id: docRef.id, ...defaultCol } as Collection);
        } else if (!currentCollection) {
          setCurrentCollection(allCols[0]);
        }
        setInitialLoading(false);
      });

      return () => unsubscribeCols();
    };

    init();
  }, [user]);

  // Links Listener (Filtered by current collection)
  useEffect(() => {
    if (!currentCollection) return;

    const q = query(
      collection(db, 'links'),
      where('collectionId', '==', currentCollection.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLinks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SocialLink[];
      setLinks(fetchedLinks);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'links');
    });

    return unsubscribe;
  }, [currentCollection]);

  // History Listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'history'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedHistory = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HistoryItem[];
      setHistory(fetchedHistory);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'history');
    });

    return unsubscribe;
  }, [user]);

  const logAction = async (linkId: string, title: string, action: 'added' | 'viewed' | 'clicked') => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'history'), {
        userId: user.uid,
        linkId,
        linkTitle: title,
        action,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'history');
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleGuestLogin = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Guest login failed", error);
      alert("ゲストモードの開始に失敗しました。以前のセッションが残っているか、設定を確認してください。");
    }
  };

  const exportData = () => {
    const data = {
      links,
      collections,
      exportDate: new Date().toISOString(),
      app: 'My Social Recipe'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `socialhub_backup_${new Date().toLocaleDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const addLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newUrl.trim() || !currentCollection) return;

    setLoadingAction(true);
    try {
      // 1. Fetch metadata via Gemini
      const metadata = await fetchLinkMetadata(newUrl);
      
      // 2. Save to Firestore
      const linkData = {
        url: newUrl,
        platform: metadata.platform,
        title: metadata.title,
        notes: metadata.description,
        tags: metadata.tags || [],
        contentType: metadata.contentType || 'other',
        collectionId: currentCollection.id,
        userId: user.uid,
        rating: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'links'), linkData);
      setNewUrl('');
      // Log history
      const title = metadata.title || 'Unknown Link';
      const q = query(collection(db, 'links'), where('url', '==', newUrl), where('collectionId', '==', currentCollection.id));
      const snap = await getDocs(q);
      if (!snap.empty) {
        logAction(snap.docs[0].id, title, 'added');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'links');
    } finally {
      setLoadingAction(false);
    }
  };

  const deleteLink = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'links', id));
      setDeletingLinkId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `links/${id}`);
    }
  };

  const saveLinkTitle = async (id: string) => {
    if (!editLinkTitleValue.trim()) {
      setEditingLinkId(null);
      return;
    }
    try {
      await updateDoc(doc(db, 'links', id), {
        title: editLinkTitleValue,
        updatedAt: serverTimestamp(),
      });
      setEditingLinkId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `links/${id}`);
    }
  };

  const updateRating = async (id: string, rating: number) => {
    try {
      await updateDoc(doc(db, 'links', id), {
        rating,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `links/${id}`);
    }
  };

  const deleteCollection = async (id: string) => {
    if (collections.length <= 1) {
      alert("少なくとも1つのカテゴリーが必要です。");
      return;
    }
    try {
      const q = query(collection(db, 'links'), where('collectionId', '==', id));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'links', d.id))));
      await deleteDoc(doc(db, 'collections', id));
      if (currentCollection?.id === id) {
        setCurrentCollection(collections.find(c => c.id !== id) || null);
      }
      setDeletingCollectionId(null);
    } catch (e) {
      console.error("Delete collection failed", e);
    }
  };

  const createCollection = async () => {
    if (!newCollectionName.trim() || !user) {
      setIsCreatingCollection(false);
      return;
    }
    setLoadingAction(true);
    try {
      const newCol = {
        name: newCollectionName.trim(),
        ownerId: user.uid,
        collaborators: [],
        isPublic: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'collections'), newCol);
      setCurrentCollection({ id: docRef.id, ...newCol } as Collection);
      setIsCreatingCollection(false);
      setNewCollectionName('');
      setInitialLoading(false);
    } catch (e) {
      console.error("Create collection failed", e);
      handleFirestoreError(e, OperationType.CREATE, 'collections');
    } finally {
      setLoadingAction(false);
    }
  };

  const saveCollectionName = async (id: string) => {
    if (!editCollectionNameValue.trim()) {
      setEditingCollectionId(null);
      return;
    }
    try {
      await updateDoc(doc(db, 'collections', id), {
        name: editCollectionNameValue,
        updatedAt: serverTimestamp(),
      });
      setEditingCollectionId(null);
    } catch (e) {
      console.error("Rename collection failed", e);
    }
  };

  const copyLinkToCollection = async (linkId: string, targetCollectionId: string) => {
    if (!user) return;
    try {
      const linkRef = doc(db, 'links', linkId);
      const linkSnap = await getDoc(linkRef);
      
      if (linkSnap.exists()) {
        const data = linkSnap.data() as SocialLink;
        const newData = {
          ...data,
          collectionId: targetCollectionId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'links'), newData);
        logAction(linkId, data.title, 'added');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `links/${linkId}/copy`);
    }
  };

  const togglePublic = async () => {
    if (!currentCollection || !user || currentCollection.ownerId !== user.uid) return;
    try {
      const newStatus = !currentCollection.isPublic;
      await updateDoc(doc(db, 'collections', currentCollection.id), {
        isPublic: newStatus,
        updatedAt: serverTimestamp(),
      });
      setCurrentCollection(prev => prev ? { ...prev, isPublic: newStatus } : null);
    } catch (e) {
      console.error("Toggle public failed", e);
    }
  };

  const copyShareLink = () => {
    if (!currentCollection) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?c=${currentCollection.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLinks = links
    .filter(link => {
      const matchesSearch = link.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        link.platform?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        link.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        link.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      if (activeCategory === 'all') return matchesSearch;
      return matchesSearch && link.platform === activeCategory;
    })
    .sort((a, b) => {
      // Sort by rating (stars) descending
      const ratingA = a.rating || 0;
      const ratingB = b.rating || 0;
      return ratingB - ratingA;
    });

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
          <p className="text-slate-500 font-medium animate-pulse">ソーシャルハブを初期化中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB] p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-4">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center shadow-indigo-200 shadow-xl">
              <LinkIcon className="text-white w-10 h-10" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">My Social Recipe</h1>
            <p className="text-gray-500 text-lg">
              お気に入りのSNSリンクを一箇所で収集・整理・共有しましょう。Gemini AIが内容を自動で解析します。
            </p>
          </div>
          
          <div className="space-y-3">
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border border-gray-200 rounded-2xl font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm hover:shadow-md"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
              Googleでログイン
            </button>
            <button
              onClick={handleGuestLogin}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-indigo-50 border border-indigo-100 rounded-2xl font-bold text-indigo-700 hover:bg-indigo-100 transition-all"
            >
              ログインせずに開始（ローカル保存）
            </button>
          </div>
          <p className="text-xs text-slate-400">
            ローカル保存は現在のブラウザにデータを残します。どのデバイスからでもアクセスするにはGoogleログインを推奨します。
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col shrink-0">
        <div className="p-6 flex-grow overflow-y-auto space-y-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
              <LinkIcon className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-indigo-950 font-display">My Social Recipe</span>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between px-3">
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">カテゴリー (フォルダ)</p>
               <button 
                onClick={() => setIsCreatingCollection(true)} 
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
               >
                 <Plus className="w-3.5 h-3.5" />
               </button>
            </div>
            <nav className="space-y-1">
              <button 
                onClick={() => {
                  setViewMode('history');
                  setActiveCategory('all');
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors text-sm pr-16 text-left",
                  viewMode === 'history' ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <HistoryIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">最近のアクティビティ</span>
              </button>

              {/* isCreatingCollection input removed from sidebar to avoid conflict with top selector */}
              {collections.map(col => (
                  <div key={col.id} className="group relative">
                    {editingCollectionId === col.id ? (
                      <div className="px-3 py-2 flex items-center gap-2 bg-indigo-50/50 rounded-md ring-1 ring-indigo-200">
                        <LayoutGrid className="w-4 h-4 shrink-0 text-indigo-600" />
                        <input 
                          autoFocus
                          value={editCollectionNameValue}
                          onChange={(e) => setEditCollectionNameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveCollectionName(col.id);
                            if (e.key === 'Escape') setEditingCollectionId(null);
                          }}
                          onBlur={() => saveCollectionName(col.id)}
                          className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-indigo-700 outline-none p-0"
                        />
                      </div>
                    ) : (
                      <button 
                        onClick={() => {
                          setCurrentCollection(col);
                          setActiveCategory('all');
                          setViewMode('standard');
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors text-sm pr-16 text-left",
                          currentCollection?.id === col.id ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <LayoutGrid className="w-4 h-4 shrink-0" />
                        <span className="truncate">{col.name}</span>
                      </button>
                    )}
                    {col.ownerId === user.uid && !editingCollectionId && (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-all">
                        {deletingCollectionId === col.id ? (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteCollection(col.id); }}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                              title="確定"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setDeletingCollectionId(null); }}
                              className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                              title="キャンセル"
                            >
                              <Plus className="w-3 h-3 rotate-45 transform" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setEditingCollectionId(col.id);
                                setEditCollectionNameValue(col.name);
                              }}
                              className="p-1 text-slate-300 hover:text-indigo-600 transition-colors"
                              title="名前変更"
                            >
                              <Settings className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setDeletingCollectionId(col.id); }}
                              className="p-1 text-slate-300 hover:text-red-500 transition-all"
                              title="削除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
              ))}
            </nav>
          </div>

          <div className="space-y-4">
            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">全体フィルター</p>
            <nav className="space-y-1">
              <button 
              onClick={() => setActiveCategory('all')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                activeCategory === 'all' ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <div className="w-2 h-2 rounded-full bg-slate-300"></div>
              すべてのプラットフォーム
            </button>
              {categories.map((cat) => (
                <button 
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                    activeCategory === cat.id ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full", cat.color)}></span>
                  {cat.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
        
        <div className="p-6 border-t border-slate-100 bg-white space-y-4">
          {user.isAnonymous && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
              <p className="text-[10px] text-amber-800 font-bold leading-tight">
                ゲストモード使用中。ブラウザのキャッシュを消去するとデータが失われます。
              </p>
              <button 
                onClick={handleLogin}
                className="w-full py-1.5 bg-white border border-amber-200 rounded text-[10px] font-bold text-amber-700 hover:bg-amber-100 transition-colors"
              >
                Googleで保存・同期する
              </button>
            </div>
          )}
          
          <button 
            onClick={exportData}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            データをローカルに書き出し (JSON)
          </button>

          <div className="flex items-center gap-3 justify-between pt-2">
            <div className="flex items-center gap-3 overflow-hidden">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'Guest'}`} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt={user.displayName || 'User'} />
              <div className="text-sm truncate">
                <p className="font-semibold truncate">{user.displayName || 'ゲストユーザー'}</p>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tighter">
                  {user.isAnonymous ? 'ローカル保存中' : 'Google同期中'}
                </p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center gap-6 shrink-0 z-20 sticky top-0">
          <div className="flex flex-col min-w-0 flex-grow max-w-sm">
             <div className="flex items-center gap-2">
               <h1 className="font-bold text-slate-900 truncate font-display">{currentCollection?.name || 'Personal Recipe'}</h1>
               {currentCollection?.isPublic && <Globe className="w-3 h-3 text-emerald-500" />}
             </div>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
               {currentCollection?.ownerId === user.uid ? 'オーナー' : '共同編集'} • {links.length} 個のリンク
             </p>
          </div>

          <div className="relative flex-1 max-w-xl mx-auto hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="コレクション内を検索..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border border-transparent focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 rounded-xl transition-all text-sm outline-none"
            />
          </div>
          
          <button 
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden lg:inline">リストを共有</span>
          </button>
        </header>

        {/* Category Selector (Top) */}
        <div 
          ref={categorySelectorRef}
          className="bg-white border-b border-slate-100 px-4 md:px-8 py-3 overflow-x-auto no-scrollbar flex items-center gap-2 shrink-0 z-10 sticky top-20"
        >
          <button 
            onClick={() => {
              setViewMode('history');
              setActiveCategory('all');
            }}
            className={cn(
              "px-4 py-2 rounded-full text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-2 uppercase tracking-wider",
              viewMode === 'history' 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <HistoryIcon className="w-3.5 h-3.5" />
            最近
          </button>
          
          <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />

          {collections.map(col => (
            <button 
              key={col.id}
              onClick={() => {
                setCurrentCollection(col);
                setActiveCategory('all');
                setViewMode('standard');
              }}
              className={cn(
                "px-4 py-2 rounded-full text-[11px] font-bold whitespace-nowrap transition-all",
                (viewMode === 'standard' && currentCollection?.id === col.id)
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" 
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              )}
            >
              {col.name}
            </button>
          ))}
          
          {isCreatingCollection ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-full px-4 py-1.5 flex items-center min-w-[150px] md:min-w-[200px] shrink-0 shadow-inner">
              <input 
                autoFocus
                placeholder="名称を入力..."
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    createCollection();
                  }
                  if (e.key === 'Escape') {
                    setIsCreatingCollection(false);
                    setNewCollectionName('');
                  }
                }}
                className="w-full bg-transparent border-none focus:ring-0 text-[11px] font-bold text-indigo-700 outline-none p-0 placeholder:text-indigo-300"
              />
              <div className="flex items-center ml-2 border-l border-indigo-100 pl-2 gap-1 px-1">
                <button 
                  onClick={createCollection}
                  className="text-indigo-600 hover:text-indigo-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  disabled={!newCollectionName.trim() || loadingAction}
                  title="確定"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => {
                    setIsCreatingCollection(false);
                    setNewCollectionName('');
                  }}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                  title="キャンセル"
                >
                  <Plus className="w-3.5 h-3.5 rotate-45 transform" />
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setIsCreatingCollection(true)}
              className="p-2 text-slate-400 hover:text-indigo-600 transition-colors shrink-0 ml-1 hover:bg-slate-50 rounded-full"
              title="カテゴリーを追加"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth">
          {viewMode === 'standard' ? (
            <>
              {/* Add Link Section */}
              <motion.section 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4"
              >
                <form onSubmit={addLink} className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="url" 
                      required
                      placeholder="URLを貼り付け（Facebook, TikTok, 商品など）"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      className="w-full pl-11 pr-4 py-4 bg-slate-100 border border-transparent focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 rounded-2xl transition-all text-sm outline-none font-medium"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={loadingAction}
                    className={cn(
                      "px-8 py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 transition-all active:scale-95",
                      loadingAction ? "opacity-50" : "hover:bg-indigo-700 hover:-translate-y-0.5"
                    )}
                  >
                    {loadingAction ? <Loader2 className="w-5 h-5 animate-spin" /> : '追加'}
                  </button>
                </form>
                {loadingAction && (
                  <div className="flex items-center gap-3 px-1">
                     <div className="flex gap-1">
                       <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                       <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                       <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce"></div>
                     </div>
                     <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Geminiがコンテンツを解析中...</p>
                  </div>
                )}
              </motion.section>

              {/* Links Grid */}
              <section>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-6 bg-indigo-600 rounded-full"></div>
                    <h2 className="text-xl font-bold text-indigo-950 font-display">
                      {activeCategory === 'all' ? 'レシピ動画' : `${activeCategory.toUpperCase()}`}
                    </h2>
                  </div>
                  <p className="text-xs font-bold text-slate-400">{filteredLinks.length} 個のアイテム同期中</p>
                </div>

                <div className="flex flex-col gap-3">
                  <AnimatePresence mode="popLayout">
                    {filteredLinks.map((link) => {
                      const Icon = PLATFORM_ICONS[link.platform] || Globe;
                      return (
                        <motion.div
                          layout
                          key={link.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center p-3 gap-4"
                        >
                          {/* Platform Icon Indicator */}
                          <div className={cn(
                            "w-10 h-10 shrink-0 rounded-lg flex items-center justify-center",
                            link.contentType === 'video' ? 'bg-slate-900' : 
                            link.contentType === 'news' ? 'bg-indigo-600' :
                            link.contentType === 'product' ? 'bg-emerald-600' :
                            link.contentType === 'profile' ? 'bg-rose-500' : 'bg-slate-200'
                          )}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>

                          <div className="flex-grow min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="min-w-0">
                               <div className="flex items-center gap-2 mb-1">
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateRating(link.id, star);
                                      }}
                                      className="focus:outline-none transition-transform hover:scale-110"
                                    >
                                      <Star
                                        className={cn(
                                          "w-3 h-3 transition-colors",
                                          star <= (link.rating || 0)
                                            ? "text-yellow-400 fill-yellow-400"
                                            : "text-slate-200 hover:text-yellow-200"
                                        )}
                                      />
                                    </button>
                                  ))}
                                </div>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest opacity-60">
                                  {link.platform}
                                </span>
                              </div>

                              {editingLinkId === link.id ? (
                                <div className="flex flex-col gap-2 mt-1">
                                  <input
                                    autoFocus
                                    value={editLinkTitleValue}
                                    onChange={(e) => setEditLinkTitleValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveLinkTitle(link.id);
                                      if (e.key === 'Escape') setEditingLinkId(null);
                                    }}
                                    className="w-full bg-slate-50 border border-indigo-200 rounded px-2 py-1 text-sm font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
                                  />
                                </div>
                              ) : (
                                <a 
                                  href={link.url} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="block"
                                  onClick={() => logAction(link.id, link.title, 'clicked')}
                                >
                                  <h3 className="font-bold text-slate-900 truncate leading-tight group-hover:text-indigo-600 transition-colors text-sm sm:text-base">
                                    {link.title}
                                  </h3>
                                </a>
                              )}
                              <p className="text-[10px] text-slate-400 truncate max-w-[200px] sm:max-w-none mt-0.5">
                                {link.notes || link.url}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 bg-slate-50/50 sm:bg-transparent p-1 rounded-lg sm:p-0 ml-auto sm:ml-0">
                              <div className="relative">
                                <button 
                                  onClick={() => {
                                    setCopyingLinkId(copyingLinkId === link.id ? null : link.id);
                                  }} 
                                  className={cn(
                                    "p-1.5 rounded-lg transition-all",
                                    copyingLinkId === link.id ? "text-emerald-600 bg-white shadow-sm" : "text-slate-400 hover:text-emerald-600 hover:bg-white"
                                  )}
                                  title="フォルダーにコピー"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <AnimatePresence>
                                  {copyingLinkId === link.id && (
                                    <motion.div 
                                      initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                      className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-30"
                                    >
                                      <p className="px-3 py-1 text-[9px] font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-50 mb-1">コピー先を選択</p>
                                      {collections.map(col => (
                                        <button 
                                          key={col.id}
                                          onClick={() => {
                                            copyLinkToCollection(link.id, col.id);
                                            setCopyingLinkId(null);
                                          }}
                                          disabled={col.id === link.collectionId}
                                          className={cn(
                                            "w-full text-left px-3 py-2 text-xs transition-colors truncate font-medium",
                                            col.id === link.collectionId ? "opacity-30 cursor-not-allowed" : "hover:bg-emerald-50 hover:text-emerald-600"
                                          )}
                                        >
                                          {col.name} {col.id === link.collectionId && "(現在)"}
                                        </button>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>

                              <button 
                                onClick={() => {
                                  setEditingLinkId(link.id);
                                  setEditLinkTitleValue(link.title);
                                }} 
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                                title="タイトル編集"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <a 
                                href={link.url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                                title="開く"
                                onClick={() => logAction(link.id, link.title, 'clicked')}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>

                              {deletingLinkId === link.id ? (
                                <div className="flex items-center gap-1 bg-red-50 rounded-lg px-0.5">
                                  <button onClick={() => deleteLink(link.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg" title="確定">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setDeletingLinkId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" title="キャンセル">
                                    <Plus className="w-3.5 h-3.5 rotate-45 transform" />
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setDeletingLinkId(link.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="削除">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
                {filteredLinks.length === 0 && !loadingAction && (
                  <div className="py-32 flex flex-col items-center justify-center text-slate-400 space-y-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <div className="w-20 h-20 rounded-3xl bg-slate-50 flex items-center justify-center border border-slate-100 shadow-inner">
                      <Search className="w-8 h-8 opacity-10" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-lg font-bold text-slate-900 font-display">まだ何もありません</p>
                      <p className="text-sm font-medium">コレクションは空です。上の入力欄にURLを貼り付けて開始してください。</p>
                    </div>
                  </div>
                )}
              </section>
            </>
          ) : (
            <motion.section 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 mb-8">
                <div className="w-2 h-6 bg-indigo-600 rounded-full"></div>
                <h2 className="text-xl font-bold text-indigo-950 font-display">最近のアクティビティ</h2>
              </div>
              
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="divide-y divide-slate-100">
                  {history.length > 0 ? history.map((item) => (
                    <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                          item.action === 'added' ? 'bg-emerald-100 text-emerald-600' :
                          item.action === 'clicked' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                        )}>
                          {item.action === 'added' ? <Plus className="w-5 h-5" /> : 
                           item.action === 'clicked' ? <ExternalLink className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{item.linkTitle || 'リンク'}</p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {item.action === 'added' ? '追加しました' : '開きました'} • {item.timestamp?.seconds ? new Date(item.timestamp.seconds * 1000).toLocaleString('ja-JP') : '同期中...'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="py-20 text-center text-slate-400">
                       <Clock className="w-8 h-8 mx-auto mb-3 opacity-20" />
                       <p className="text-sm font-medium">履歴がありません</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.section>
          )}
        </div>

        {/* Share Modal */}
        <AnimatePresence>
          {showShareModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/20 backdrop-blur-sm"
              onClick={() => setShowShareModal(false)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-8 border border-slate-100"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold font-display text-slate-900">コレクションを共有</h3>
                    <p className="text-xs text-slate-500 font-medium tracking-tight">共同編集と同期の設定</p>
                  </div>
                  <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <Trash2 className="w-5 h-5 rotate-45 transform" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg", currentCollection?.isPublic ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-500")}>
                        <Globe className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-800">一般公開</p>
                        <p className="text-[10px] text-slate-500">{currentCollection?.isPublic ? 'リンクを知っている全員が閲覧可能' : 'あなただけがアクセス可能'}</p>
                      </div>
                    </div>
                    {currentCollection?.ownerId === user.uid && (
                      <button 
                        onClick={togglePublic}
                        className={cn(
                          "w-12 h-6 rounded-full relative transition-colors",
                          currentCollection?.isPublic ? "bg-emerald-500" : "bg-slate-300"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          currentCollection?.isPublic ? "right-1" : "left-1"
                        )} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">共有用リンク</p>
                     <div className="flex gap-2">
                       <input 
                         readOnly
                         value={`${window.location.origin}${window.location.pathname}?c=${currentCollection?.id}`}
                         className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 outline-none"
                       />
                       <button 
                        onClick={copyShareLink}
                        className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
                       >
                         {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                       </button>
                     </div>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex gap-4">
                    <Users className="w-5 h-5 text-blue-600 shrink-0 mt-1" />
                    <div className="space-y-1">
                       <p className="text-xs font-bold text-blue-900 leading-tight">共同編集同期</p>
                       <p className="text-[10px] text-blue-700 font-medium leading-relaxed">
                         ログインした状態でリンクを開くと、複数のユーザーでリストを共有・編集できます。現在 {currentCollection?.collaborators.length || 0} 人の共同編集者が参加しています。
                       </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 text-center">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse italic">
                     変更はすべてのセッションでリアルタイムに同期されます
                   </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
