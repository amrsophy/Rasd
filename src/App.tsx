/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  UserPlus, 
  Users, 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  Upload, 
  Camera, 
  FileText, 
  Search, 
  Bell, 
  Settings, 
  Menu, 
  X,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Info,
  LogIn,
  LogOut,
  History,
  Trash2,
  Crop,
  Download,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { verifyPlayer, VerificationResult } from './services/geminiService';
import { Player, AuditLog } from './types';
import { GOVERNORATES, SPORTS, EGYPTIAN_CLUBS } from './constants';
import { translations, Language } from './translations';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  collection, 
  addDoc, 
  query, 
  where,
  getDocs,
  onSnapshot, 
  orderBy, 
  Timestamp,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  User
} from './firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function logAction(action: string, details?: string, targetId?: string, targetName?: string) {
  if (!auth.currentUser) return;
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action,
      details: details || '',
      performedBy: auth.currentUser.uid,
      performedByName: auth.currentUser.displayName || auth.currentUser.email || 'Unknown',
      timestamp: serverTimestamp(),
      targetId: targetId || '',
      targetName: targetName || ''
    });
  } catch (err) {
    console.error('Failed to log action:', err);
  }
}

function LanguageToggle({ language, setLanguage }: { language: Language, setLanguage: (l: Language) => void }) {
  return (
    <div className="flex items-center bg-white/10 backdrop-blur-md rounded-xl p-1 border border-white/10">
      <button 
        onClick={() => setLanguage('ar')}
        className={cn(
          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
          language === 'ar' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
        )}
      >
        العربية
      </button>
      <button 
        onClick={() => setLanguage('en')}
        className={cn(
          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
          language === 'en' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
        )}
      >
        English
      </button>
    </div>
  );
}

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [language, setLanguage] = useState<Language>('ar');
  const t = (key: keyof typeof translations['ar']) => translations[language][key] || key;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'verify' | 'players' | 'admin'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'google' | 'local'>('google');
  const [isSignUp, setIsSignUp] = useState(false);
  const [localEmail, setLocalEmail] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  const [localName, setLocalName] = useState('');

  // Form state
  const [photo, setPhoto] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<string | null>(null);
  const [governorate, setGovernorate] = useState('');
  const [sport, setSport] = useState('');
  const [club, setClub] = useState('');
  
  // Cropping State
  const [showCropper, setShowCropper] = useState(false);
  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [dragActive, setDragActive] = useState<{ photo: boolean; certificate: boolean }>({ photo: false, certificate: false });
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<{ photo: boolean; certificate: boolean }>({ photo: false, certificate: false });
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newPlayer, setNewPlayer] = useState({
    name: '',
    birthDate: '',
    sport: '',
    club: '',
    governorate: '',
    photoUrl: 'https://picsum.photos/seed/player/200/200' // Default placeholder for manual entry
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');

  // Test Connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
          setError(t('errorFirebaseConfig'));
        }
      }
    };
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("Auth state changed:", currentUser?.email);
      try {
        setUser(currentUser);
        if (currentUser) {
          setError(null); // Clear errors on successful login
          // Sync user to Firestore
          const userRef = doc(db, 'users', currentUser.uid);
          let userSnap;
          try {
            userSnap = await getDoc(userRef);
          } catch (err) {
            console.error("Failed to get user doc:", err);
            // Fallback: If we can't get the doc, we might still be admin by email
            if (currentUser.email === 'amr.sophy@gmail.com') setIsAdmin(true);
            return;
          }
          
          if (!userSnap.exists()) {
            // Check if user was pre-created by email
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', currentUser.email));
            const querySnap = await getDocs(q);
            
            if (!querySnap.empty) {
              const existingDoc = querySnap.docs[0];
              const existingData = existingDoc.data();
              
              await setDoc(userRef, {
                ...existingData,
                displayName: currentUser.displayName || existingData.displayName,
                photoURL: currentUser.photoURL || existingData.photoURL,
                updatedAt: serverTimestamp()
              });
              
              if (existingDoc.id !== currentUser.uid) {
                await deleteDoc(doc(db, 'users', existingDoc.id));
              }
              
              setIsAdmin(existingData.role === 'admin');
            } else {
              try {
                await setDoc(userRef, {
                  email: currentUser.email,
                  displayName: currentUser.displayName,
                  photoURL: currentUser.photoURL,
                  role: currentUser.email === 'amr.sophy@gmail.com' ? 'admin' : 'user',
                  createdAt: serverTimestamp()
                });
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
              }
              if (currentUser.email === 'amr.sophy@gmail.com') setIsAdmin(true);
            }
          } else {
            const userData = userSnap.data();
            setIsAdmin(userData.role === 'admin');
          }
        } else {
          setIsAdmin(false);
        }
      } catch (err) {
        console.error("Auth sync error:", err);
        setError(t('errorUserSync'));
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Admin: Fetch all users
  useEffect(() => {
    if (!isAdmin) {
      setAllUsers([]);
      return;
    }

    const q = query(collection(db, 'users'), orderBy('email', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(usersData);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [isAdmin]);

  // Admin: Fetch audit logs
  useEffect(() => {
    if (!isAdmin) {
      setAuditLogs([]);
      return;
    }

    const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AuditLog[];
      setAuditLogs(logsData);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'auditLogs');
    });

    return () => unsubscribe();
  }, [isAdmin]);

  // Firestore Listener
  useEffect(() => {
    if (!user) {
      setPlayers([]);
      return;
    }

    const q = query(collection(db, 'players'), orderBy('verifiedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const playersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Player[];
      setPlayers(playersData);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'players');
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.code === 'auth/popup-closed-by-user') {
        // Just ignore
      } else {
        setError(t('errorLoginFailed'));
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLocalAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localEmail || !localPassword) return;
    if (isSignUp && !localName) return;

    setIsLoggingIn(true);
    setError(null);
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, localEmail, localPassword);
        await updateProfile(userCredential.user, { displayName: localName });
        // Force sync
        setUser({ ...userCredential.user, displayName: localName } as User);
      } else {
        await signInWithEmailAndPassword(auth, localEmail, localPassword);
      }
    } catch (err: any) {
      console.error("Local auth error:", err);
      let errorMsg = t('errorLoginFailed');
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = language === 'ar' ? 'البريد الإلكتروني مستخدم بالفعل' : 'Email already in use';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = language === 'ar' ? 'كلمة المرور ضعيفة جداً' : 'Password is too weak';
      } else if (err.code === 'auth/invalid-credential') {
        errorMsg = language === 'ar' ? 'بيانات الاعتماد غير صالحة' : 'Invalid credentials';
      } else if (err.code === 'auth/operation-not-allowed') {
        errorMsg = language === 'ar' ? 'يجب تفعيل خيار الدخول بالبريد الإلكتروني من لوحة تحكم Firebase' : 'Email/Password auth is not enabled in Firebase';
      }
      setError(errorMsg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent, type: 'photo' | 'certificate') => {
    let file: File | undefined;
    
    if ('files' in e.target && e.target.files) {
      file = e.target.files[0];
    } else if ('dataTransfer' in e && e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
    }

    if (file) {
      if (!file.type.startsWith('image/')) {
        setError(t('errorInvalidImage'));
        return;
      }
      
      setIsProcessingFile(prev => ({ ...prev, [type]: true }));
      
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'photo') {
          setTempPhoto(reader.result as string);
          setShowCropper(true);
        } else {
          setCertificate(reader.result as string);
        }
        setIsProcessingFile(prev => ({ ...prev, [type]: false }));
      };
      reader.onerror = () => {
        setError(t('errorFileRead'));
        setIsProcessingFile(prev => ({ ...prev, [type]: false }));
      };
      reader.readAsDataURL(file);
    }
  };

  const onDrag = (e: React.DragEvent, type: 'photo' | 'certificate', active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(prev => ({ ...prev, [type]: active }));
  };

  const onDrop = (e: React.DragEvent, type: 'photo' | 'certificate') => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(prev => ({ ...prev, [type]: false }));
    handleFileChange(e, type);
  };

  const onCropComplete = (croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<string | null> => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise((resolve) => (image.onload = resolve));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return canvas.toDataURL('image/jpeg');
  };

  const handleSaveCrop = async () => {
    if (tempPhoto && croppedAreaPixels) {
      const croppedImage = await getCroppedImg(tempPhoto, croppedAreaPixels);
      if (croppedImage) {
        setPhoto(croppedImage);
        setShowCropper(false);
        setTempPhoto(null);
      }
    }
  };

  const handleDownloadReport = async () => {
    if (!verificationResult) return;

    const reportElement = document.getElementById('verification-report');
    if (!reportElement) return;

    setIsVerifying(true);
    
    try {
      const canvas = await html2canvas(reportElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${t('technicalReport')}_${verificationResult.playerName || t('player')}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setError(t('errorPDF'));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportPlayersPDF = async () => {
    if (players.length === 0) return;
    
    setIsVerifying(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      if (language === 'ar') {
        // @ts-ignore - setR2L is a custom/plugin method
        if (typeof pdf.setR2L === 'function') pdf.setR2L(true);
      }
      
      pdf.setFontSize(20);
      pdf.text(t('playerList'), 105, 20, { align: 'center' });
      
      pdf.setFontSize(10);
      pdf.text(`${t('exportDate')}: ${new Date().toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}`, language === 'ar' ? 190 : 20, 30, { align: language === 'ar' ? 'right' : 'left' });
      
      let y = 40;
      pdf.setFontSize(12);
      const headers = [t('playerName'), t('governorate'), t('sport'), t('estimatedAge'), t('status')];
      const xPositions = language === 'ar' ? [190, 140, 100, 60, 30] : [20, 70, 110, 150, 180];
      const align = language === 'ar' ? 'right' : 'left';

      headers.forEach((header, i) => {
        pdf.text(header, xPositions[i], y, { align });
      });
      
      pdf.line(10, y + 2, 200, y + 2);
      y += 10;
      
      players.forEach((player) => {
        if (y > 270) {
          pdf.addPage();
          y = 20;
        }
        
        pdf.setFontSize(10);
        const values = [
          player.name,
          player.governorate || '-',
          player.sport || '-',
          `${player.estimatedAge} ${t('years')}`,
          t(player.matchStatus)
        ];

        values.forEach((val, i) => {
          pdf.text(val, xPositions[i], y, { align });
        });
        
        pdf.line(10, y + 2, 200, y + 2);
        y += 10;
      });
      
      pdf.save(`${t('playerList')}.pdf`);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      setError(t('errorPDFExport'));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportAuditLogsPDF = async () => {
    if (auditLogs.length === 0) return;
    
    setIsVerifying(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      if (language === 'ar') {
        // @ts-ignore
        if (typeof pdf.setR2L === 'function') pdf.setR2L(true);
      }
      
      pdf.setFontSize(20);
      pdf.text(t('auditLog'), 105, 20, { align: 'center' });
      
      pdf.setFontSize(10);
      pdf.text(`${t('exportDate')}: ${new Date().toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}`, language === 'ar' ? 190 : 20, 30, { align: language === 'ar' ? 'right' : 'left' });
      
      let y = 40;
      pdf.setFontSize(12);
      const headers = [t('tableAction'), t('tableDetails'), t('tablePerformedBy'), t('tableTimestamp')];
      const xPositions = language === 'ar' ? [190, 140, 80, 30] : [20, 70, 130, 180];
      const align = language === 'ar' ? 'right' : 'left';

      headers.forEach((header, i) => {
        pdf.text(header, xPositions[i], y, { align });
      });
      
      pdf.line(10, y + 2, 200, y + 2);
      y += 10;
      
      auditLogs.forEach((log) => {
        if (y > 270) {
          pdf.addPage();
          y = 20;
        }
        
        const date = log.timestamp instanceof Timestamp ? 
          log.timestamp.toDate().toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US') : 
          new Date(log.timestamp).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US');

        pdf.setFontSize(10);
        pdf.text(log.action, xPositions[0], y, { align });
        
        // Handle long details by splitting into lines
        const detailsLines = pdf.splitTextToSize(log.details, 60);
        pdf.text(detailsLines, xPositions[1], y, { align });
        
        pdf.text(log.performedByName, xPositions[2], y, { align });
        pdf.text(date, xPositions[3], y, { align });
        
        const lineHeight = detailsLines.length * 5;
        pdf.line(10, y + lineHeight - 3, 200, y + lineHeight - 3);
        y += Math.max(10, lineHeight);
      });
      
      pdf.save(`${t('auditLog')}.pdf`);
    } catch (err) {
      console.error('Failed to export Audit Logs PDF:', err);
      setError(t('errorAuditLogExport'));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerify = async () => {
    if (!photo || !certificate) {
      setError(t('errorUploadRequired'));
      return;
    }

    if (!user) {
      setError(t('errorLoginRequired'));
      return;
    }

    setIsVerifying(true);
    setError(null);
    setVerificationResult(null);

    try {
      const photoBase64 = photo.split(',')[1];
      const certificateBase64 = certificate.split(',')[1];

      const result = await verifyPlayer(certificateBase64, photoBase64, language);
      setVerificationResult(result);

      // Save to Firestore
      try {
        const playerDoc = await addDoc(collection(db, 'players'), {
          name: result.playerName || 'Unknown',
          birthDate: result.birthDate || 'Unknown',
          estimatedAge: result.estimatedAge || 0,
          confidence: result.confidence || 0,
          matchStatus: result.matchStatus || 'suspicious',
          reasoning: result.reasoning || '',
          photoUrl: photo || '', 
          certificateUrl: certificate || '',
          governorate: governorate || '',
          sport: sport || '',
          club: club || '',
          verifiedAt: Timestamp.now(),
          createdBy: user.uid
        });

        await logAction(
          t('logActionVerify'),
          `${t('logDetailsVerify')} ${result.playerName} - ${t(result.matchStatus)}`,
          playerDoc.id,
          result.playerName
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'players');
      }

    } catch (err: any) {
      if (err.message === 'QUOTA_EXCEEDED') {
        setError(t('errorQuota'));
      } else if (err.message === 'VERIFICATION_FAILED') {
        setError(t('errorVerification'));
      } else {
        setError(err.message || t('errorGeneral'));
      }
      console.error(err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleViewReport = (player: Player) => {
    setVerificationResult({
      playerName: player.name,
      birthDate: player.birthDate,
      estimatedAge: player.estimatedAge,
      confidence: player.confidence,
      matchStatus: player.matchStatus,
      reasoning: player.reasoning || ''
    });
    setPhoto(player.photoUrl);
    setCertificate(player.certificateUrl);
    setGovernorate(player.governorate || '');
    setSport(player.sport || '');
    setClub(player.club || '');
    setActiveTab('verify');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!isAdmin) return;
    
    const player = players.find(p => p.id === playerId);
    
    try {
      await deleteDoc(doc(db, 'players', playerId));
      await logAction(
        t('logActionDeletePlayer'),
        `${t('logDetailsDeletePlayer')} ${player?.name || playerId}`,
        playerId,
        player?.name
      );
      setPlayerToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `players/${playerId}`);
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!newPlayer.name.trim()) errors.name = t('errorNameRequired');
    if (!newPlayer.birthDate) errors.birthDate = t('errorBirthDateRequired');
    if (!newPlayer.sport) errors.sport = t('errorSportRequired');
    if (!newPlayer.club) errors.club = t('errorClubRequired');
    if (!newPlayer.governorate) errors.governorate = t('errorGovernorateRequired');
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleManualAddPlayer = async () => {
    if (!validateForm()) return;
    
    setIsVerifying(true);
    try {
      // Calculate age from birthDate
      const birthDate = new Date(newPlayer.birthDate);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      const playerData: any = {
        name: newPlayer.name,
        birthDate: newPlayer.birthDate,
        estimatedAge: age,
        confidence: 100, // Manual entry is considered 100% confident by the user
        matchStatus: 'match',
        photoUrl: newPlayer.photoUrl,
        certificateUrl: '', // No certificate for manual entry
        verifiedAt: serverTimestamp(),
        reasoning: t('manualAddReasoning'),
        governorate: newPlayer.governorate,
        sport: newPlayer.sport,
        club: newPlayer.club,
        createdBy: auth.currentUser?.uid
      };

      const playerDoc = await addDoc(collection(db, 'players'), playerData);
      
      await logAction(
        t('logActionAddPlayer'),
        `${t('logDetailsAddPlayer')} ${newPlayer.name}`,
        playerDoc.id,
        newPlayer.name
      );

      setShowAddPlayerModal(false);
      setNewPlayer({
        name: '',
        birthDate: '',
        sport: '',
        club: '',
        governorate: '',
        photoUrl: 'https://picsum.photos/seed/player/200/200'
      });
      setFormErrors({});
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'players');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail.trim()) {
      setError(t('userEmail') + ' ' + (language === 'ar' ? 'مطلوب' : 'is required'));
      return;
    }

    if (!newUserEmail.includes('@')) {
      setError(t('errorEmailInvalid'));
      return;
    }

    setIsVerifying(true);
    try {
      const userRef = await addDoc(collection(db, 'users'), {
        email: newUserEmail.trim(),
        displayName: newUserName.trim() || null,
        role: newUserRole,
        createdAt: serverTimestamp(),
        manual: true
      });

      await logAction(
        t('addUser'),
        `${t('addUser')} ${newUserEmail} (${newUserRole})`,
        userRef.id,
        newUserEmail
      );

      setShowAddUserModal(false);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserRole('user');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'users');
    } finally {
      setIsVerifying(false);
    }
  };

  const resetForm = () => {
    setPhoto(null);
    setCertificate(null);
    setGovernorate('');
    setSport('');
    setClub('');
    setVerificationResult(null);
    setError(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className={cn("min-h-screen bg-[#0F172A] flex items-center justify-center p-6 font-sans", language === 'ar' ? "dir-rtl" : "dir-ltr")} dir={language === 'ar' ? "rtl" : "ltr"}>
        <div className="fixed top-6 right-6 z-50">
          <LanguageToggle language={language} setLanguage={setLanguage} />
        </div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[2rem] p-12 max-w-md w-full shadow-2xl text-center space-y-8"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-blue-600/20">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('appName')}</h1>
            <p className="text-slate-500 leading-relaxed">
              {t('appDescription')}
            </p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="mr-auto text-red-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          <div className="flex bg-slate-100 p-1 rounded-2xl mb-4">
            <button
              onClick={() => setAuthMode('google')}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-bold transition-all",
                authMode === 'google' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
              )}
            >
              {t('loginGoogle')}
            </button>
            <button
              onClick={() => setAuthMode('local')}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-bold transition-all",
                authMode === 'local' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
              )}
            >
              {t('loginLocal')}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {authMode === 'google' ? (
              <motion.div
                key="google"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <button 
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="w-full py-4 bg-white border-2 border-slate-200 rounded-2xl font-extrabold text-slate-800 flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-blue-300 transition-all group disabled:opacity-50"
                >
                  {isLoggingIn ? (
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  ) : (
                    <LogIn className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" />
                  )}
                  {t('loginWithGoogle')}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="local"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <form onSubmit={handleLocalAuth} className="space-y-4">
                  {isSignUp && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 px-2">{t('userName')}</label>
                      <input
                        type="text"
                        required
                        value={localName}
                        onChange={(e) => setLocalName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-right"
                        placeholder={language === 'ar' ? 'أدخل اسمك بالكامل' : 'Enter your full name'}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 px-2">{t('email')}</label>
                    <input
                      type="email"
                      required
                      value={localEmail}
                      onChange={(e) => setLocalEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-right"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 px-2">{t('password')}</label>
                    <input
                      type="password"
                      required
                      value={localPassword}
                      onChange={(e) => setLocalPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-right"
                      placeholder="••••••••"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-extrabold flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
                  >
                    {isLoggingIn ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <LogIn className="w-5 h-5 text-white" />
                    )}
                    {isSignUp ? t('signup') : t('login')}
                  </button>
                </form>
                
                <div className="text-center">
                  <button
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-sm font-bold text-blue-600 hover:underline"
                  >
                    {isSignUp ? t('hasAccount') : t('noAccount')} {isSignUp ? t('login') : t('createAccount')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="text-xs text-slate-400">
            {t('privacyPolicy')}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans flex", language === 'ar' ? "dir-rtl" : "dir-ltr")} dir={language === 'ar' ? "rtl" : "ltr"}>
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-[#0F172A] text-white transition-all duration-300 flex flex-col fixed h-full z-50",
          isSidebarOpen ? "w-64" : "w-20",
          language === 'ar' ? "right-0" : "left-0"
        )}
      >
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <div className="w-10 h-10 bg-[#3B82F6] rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          {isSidebarOpen && (
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-bold text-xl tracking-tight"
            >
              {t('appName').split(' ').length > 2 
                ? `${t('appName').split(' ')[1]} ${t('appName').split(' ')[2]}`
                : t('appName')
              }
            </motion.span>
          )}
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-2">
          <SidebarItem 
            icon={<LayoutDashboard />} 
            label={t('dashboard')} 
            active={activeTab === 'dashboard'} 
            collapsed={!isSidebarOpen}
            onClick={() => setActiveTab('dashboard')}
          />
          <SidebarItem 
            icon={<UserPlus />} 
            label={t('verifyNew')} 
            active={activeTab === 'verify'} 
            collapsed={!isSidebarOpen}
            onClick={() => setActiveTab('verify')}
          />
          <SidebarItem 
            icon={<Users />} 
            label={t('verifiedPlayers')} 
            active={activeTab === 'players'} 
            collapsed={!isSidebarOpen}
            onClick={() => setActiveTab('players')}
          />
          {isAdmin && (
            <SidebarItem 
              icon={<ShieldCheck className="text-amber-500" />} 
              label={t('userManagement')} 
              active={activeTab === 'admin'} 
              collapsed={!isSidebarOpen}
              onClick={() => setActiveTab('admin')}
            />
          )}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="mb-4">
            <LanguageToggle language={language} setLanguage={setLanguage} />
          </div>
          <SidebarItem 
            icon={<Settings />} 
            label={t('settings')} 
            collapsed={!isSidebarOpen}
          />
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full mt-2 p-3 rounded-xl hover:bg-white/5 flex items-center justify-center transition-colors"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 transition-all duration-300 min-h-screen",
        isSidebarOpen ? (language === 'ar' ? "mr-64" : "ml-64") : (language === 'ar' ? "mr-20" : "ml-20")
      )}>
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-20 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-slate-800">
              {activeTab === 'dashboard' && t('dashboard')}
              {activeTab === 'verify' && t('verifyNew')}
              {activeTab === 'players' && t('verifiedPlayers')}
              {activeTab === 'admin' && t('userManagement')}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {error && !loading && user && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="hidden lg:flex items-center gap-3 bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-bold border border-red-100"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{error}</span>
                <button onClick={() => setError(null)} className="hover:text-red-800">
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
            <div className="relative">
              <Search className={cn("w-5 h-5 text-slate-400 absolute top-1/2 -translate-y-1/2", language === 'ar' ? "right-3" : "left-3")} />
              <input 
                type="text" 
                placeholder={t('searchPlaceholder')} 
                className={cn(
                  "bg-slate-100 border-none rounded-full py-2 w-64 focus:ring-2 focus:ring-blue-500 transition-all outline-none text-sm",
                  language === 'ar' ? "pr-10 pl-4" : "pl-10 pr-4"
                )}
              />
            </div>
            <button className="p-2 rounded-full hover:bg-slate-100 relative">
              <Bell className="w-5 h-5 text-slate-600" />
              <span className={cn("absolute top-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white", language === 'ar' ? "right-2" : "left-2")}></span>
            </button>
            <div className={cn("flex items-center gap-3", language === 'ar' ? "mr-2" : "ml-2")}>
              <div className={cn("hidden md:block", language === 'ar' ? "text-left" : "text-right")}>
                <p className="text-xs font-bold text-slate-800">{user.displayName}</p>
                <button onClick={handleLogout} className="text-[10px] text-red-500 hover:underline">{t('logout')}</button>
              </div>
              <img src={user.photoURL || undefined} className="w-10 h-10 rounded-full border-2 border-blue-200" alt="Profile" />
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard title={t('totalPlayers')} value={players.length} icon={<Users className="text-blue-500" />} trend="+12%" />
                  <StatCard title={t('successfulVerifications')} value={players.filter(p => p.matchStatus === 'match').length} icon={<ShieldCheck className="text-emerald-500" />} trend="+5%" />
                  <StatCard title={t('suspiciousCases')} value={players.filter(p => p.matchStatus === 'suspicious').length} icon={<AlertTriangle className="text-amber-500" />} trend="-2%" />
                  <StatCard title={t('fraudCases')} value={players.filter(p => p.matchStatus === 'mismatch').length} icon={<XCircle className="text-red-500" />} trend="0%" />
                </div>

                {/* Recent Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-bold text-lg">{t('recentVerifications')}</h3>
                      <button className="text-blue-600 text-sm font-medium hover:underline">{t('viewAll')}</button>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {players.slice(0, 5).map((player, idx) => (
                        <div key={player.id || `recent-${idx}`} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4">
                            <img src={player.photoUrl || undefined} alt={player.name} className="w-12 h-12 rounded-xl object-cover" />
                            <div>
                              <p className="font-bold text-slate-800">{player.name}</p>
                              <p className="text-xs text-slate-500">{new Date(player.verifiedAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}</p>
                            </div>
                          </div>
                          <StatusBadge status={player.matchStatus} language={language} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col gap-6">
                    <h3 className="font-bold text-lg">{t('caseDistribution')}</h3>
                    <div className="flex-1 flex items-center justify-center">
                      {/* Simple visual representation of distribution */}
                      <div className="relative w-48 h-48 rounded-full border-8 border-slate-100 flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-3xl font-bold text-slate-800">90%</p>
                          <p className="text-xs text-slate-500">{t('systemAccuracy')}</p>
                        </div>
                        {/* Mock SVG chart circle */}
                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                          <circle 
                            cx="96" cy="96" r="88" 
                            fill="none" 
                            stroke="#3B82F6" 
                            strokeWidth="8" 
                            strokeDasharray="552" 
                            strokeDashoffset="55"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> {t('match')}</span>
                        <span className="font-bold">75%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div> {t('suspicious')}</span>
                        <span className="font-bold">15%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div> {t('mismatch')}</span>
                        <span className="font-bold">10%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'verify' && (
              <motion.div 
                key="verify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-4xl mx-auto"
              >
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-8 border-b border-slate-100">
                    <h3 className="text-xl font-bold mb-2">{t('startVerification')}</h3>
                    <p className="text-slate-500 text-sm">{t('verificationInstructions')}</p>
                  </div>

                  <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-slate-50">
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-700">{t('governorate')}</label>
                      <select 
                        value={governorate}
                        onChange={(e) => setGovernorate(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      >
                        <option value="">{t('selectGovernorate')}</option>
                        {GOVERNORATES.map(gov => (
                          <option key={gov.ar} value={gov.ar}>{language === 'ar' ? gov.ar : gov.en}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-700">{t('sport')}</label>
                      <select 
                        value={sport}
                        onChange={(e) => setSport(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      >
                        <option value="">{t('selectSport')}</option>
                        {SPORTS.map(s => (
                          <option key={s.ar} value={s.ar}>{language === 'ar' ? s.ar : s.en}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-700">{t('club')}</label>
                      <select 
                        value={club}
                        onChange={(e) => setClub(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      >
                        <option value="">{t('selectClub')}</option>
                        {EGYPTIAN_CLUBS.map(c => (
                          <option key={c.ar} value={c.ar}>{language === 'ar' ? c.ar : c.en}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="block text-sm font-bold text-slate-700">{t('playerPhoto')}</label>
                      <FileUpload 
                        id="photo"
                        label={t('uploadPhoto')}
                        icon={<Camera />}
                        preview={photo}
                        onUpload={(data) => {
                          setTempPhoto(data);
                          setShowCropper(true);
                        }}
                        dragActive={dragActive.photo}
                        onDrag={(active) => setDragActive({ ...dragActive, photo: active })}
                        isProcessing={isProcessingFile.photo}
                        language={language}
                        t={t}
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="block text-sm font-bold text-slate-700">{t('birthCertificate')}</label>
                      <FileUpload 
                        id="certificate"
                        label={t('uploadCertificate')}
                        icon={<FileText />}
                        preview={certificate}
                        onUpload={setCertificate}
                        dragActive={dragActive.certificate}
                        onDrag={(active) => setDragActive({ ...dragActive, certificate: active })}
                        isProcessing={isProcessingFile.certificate}
                        language={language}
                        t={t}
                      />
                    </div>
                  </div>

                  <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Info className="w-4 h-4" />
                      <span>{t('aiAnalysisNotice')}</span>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={resetForm}
                        className="px-6 py-2 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-white transition-colors"
                      >
                        {t('reset')}
                      </button>
                      <button 
                        onClick={handleVerify}
                        disabled={isVerifying || !photo || !certificate}
                        className="px-8 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all"
                      >
                        {isVerifying ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {t('processing')}
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-5 h-5" />
                            {t('verifyButton')}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Results Section */}
                <AnimatePresence>
                  {verificationResult && (
                    <motion.div 
                      id="verification-report"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-8 bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-lg"
                    >
                      <div className={cn(
                        "p-6 flex items-center justify-between text-white",
                        verificationResult.matchStatus === 'match' ? "bg-emerald-500" :
                        verificationResult.matchStatus === 'suspicious' ? "bg-amber-500" : "bg-red-500"
                      )}>
                        <div className="flex items-center gap-3">
                          {verificationResult.matchStatus === 'match' ? <CheckCircle2 className="w-8 h-8" /> :
                           verificationResult.matchStatus === 'suspicious' ? <AlertTriangle className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
                          <div>
                            <h4 className="font-bold text-lg">
                              {verificationResult.matchStatus === 'match' ? t('verificationSuccess') :
                               verificationResult.matchStatus === 'suspicious' ? t('verificationSuspicious') : t('verificationMismatch')}
                            </h4>
                            <p className="text-white/80 text-sm">{t('confidenceScore')}: {verificationResult.confidence}%</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 no-print">
                          <button 
                            onClick={handleDownloadReport}
                            disabled={isVerifying}
                            className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
                          >
                            {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {t('downloadReport')}
                          </button>
                          <button 
                            onClick={() => window.print()}
                            className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-bold flex items-center gap-2 transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                            {t('print')}
                          </button>
                        </div>
                      </div>

                      <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <ResultItem label={t('playerName')} value={verificationResult.playerName} />
                          <div className="grid grid-cols-3 gap-4">
                            <ResultItem label={t('governorate')} value={governorate || '-'} />
                            <ResultItem label={t('sport')} value={sport || '-'} />
                            <ResultItem label={t('club')} value={club || '-'} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <ResultItem label={t('birthDate')} value={verificationResult.birthDate} />
                            <ResultItem label={t('estimatedAge')} value={`${verificationResult.estimatedAge} ${t('years')}`} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">{t('reasoning')}</p>
                            <p className="text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              {verificationResult.reasoning}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-4">
                          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex-1 flex flex-col items-center justify-center text-center">
                            <div className="w-32 h-32 rounded-full border-4 border-white shadow-md overflow-hidden mb-4">
                              <img src={photo || undefined} alt="Verified" className="w-full h-full object-cover" />
                            </div>
                            <p className="text-sm font-bold text-slate-700">{t('playerPhoto')}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-8 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 flex items-center gap-3"
                    >
                      <XCircle className="w-5 h-5" />
                      <p className="font-medium">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {activeTab === 'players' && (
              <motion.div 
                key="players"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-lg">{t('playerList')}</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleExportPlayersPDF}
                        disabled={isVerifying || players.length === 0}
                        className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {t('exportPDF')}
                      </button>
                      <button 
                        onClick={() => setShowAddPlayerModal(true)}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
                      >
                        {t('addPlayer')}
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 text-xs uppercase font-bold tracking-wider">
                          <th className="px-6 py-4">{t('tablePlayer')}</th>
                          <th className="px-6 py-4">{t('tableGovernorate')}</th>
                          <th className="px-6 py-4">{t('tableSport')}</th>
                          <th className="px-6 py-4">{t('tableClub')}</th>
                          <th className="px-6 py-4">{t('tableBirthDate')}</th>
                          <th className="px-6 py-4">{t('tableAge')}</th>
                          <th className="px-6 py-4">{t('tableStatus')}</th>
                          <th className="px-6 py-4">{t('tableDate')}</th>
                          <th className="px-6 py-4">{t('tableActions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {players.map((player, idx) => (
                          <tr key={player.id || `player-${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <img src={player.photoUrl || undefined} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                <span className="font-bold text-slate-800">{player.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-600 text-sm">{player.governorate || '-'}</td>
                            <td className="px-6 py-4 text-slate-600 text-sm">{player.sport || '-'}</td>
                            <td className="px-6 py-4 text-slate-600 text-sm">{player.club || '-'}</td>
                            <td className="px-6 py-4 text-slate-600">{player.birthDate}</td>
                            <td className="px-6 py-4 font-mono text-slate-600">{player.estimatedAge} {t('years')}</td>
                            <td className="px-6 py-4">
                              <StatusBadge status={player.matchStatus} language={language} />
                            </td>
                            <td className="px-6 py-4 text-slate-500 text-sm">
                              {player.verifiedAt instanceof Timestamp ? 
                                player.verifiedAt.toDate().toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US') : 
                                new Date(player.verifiedAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => handleViewReport(player)}
                                  className="p-2 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-blue-600 transition-colors"
                                  title={t('viewReport')}
                                >
                                  <ChevronRight className={cn("w-5 h-5", language === 'en' && "rotate-180")} />
                                </button>
                                {isAdmin && (
                                  <button 
                                    onClick={() => setPlayerToDelete(player.id)}
                                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                    title={t('deleteVerification')}
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'admin' && isAdmin && (
              <motion.div 
                key="admin"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{t('adminUserManagement')}</h3>
                      <p className="text-slate-500 text-sm">{t('adminUserManagementDesc')}</p>
                    </div>
                    <button 
                      onClick={() => setShowAddUserModal(true)}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <UserPlus className="w-4 h-4" />
                      {t('addUser')}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 text-xs uppercase font-bold tracking-wider">
                          <th className="px-6 py-4">{t('tableUser')}</th>
                          <th className="px-6 py-4">{t('tableEmail')}</th>
                          <th className="px-6 py-4">{t('tableRole')}</th>
                          <th className="px-6 py-4">{t('tableChangeRole')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <img src={u.photoURL || undefined} alt="" className="w-8 h-8 rounded-full border border-slate-200" />
                                <span className="font-bold text-slate-800">{u.displayName || (language === 'ar' ? 'بدون اسم' : 'No Name')}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-600 text-sm">{u.email}</td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-3 py-1 rounded-full text-xs font-bold border",
                                u.role === 'admin' ? "bg-purple-50 text-purple-600 border-purple-100" : "bg-slate-50 text-slate-600 border-slate-100"
                              )}>
                                {u.role === 'admin' ? t('roleAdmin') : t('roleUser')}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <select 
                                value={u.role}
                                onChange={async (e) => {
                                  try {
                                    const newRole = e.target.value;
                                    await updateDoc(doc(db, 'users', u.id), { role: newRole });
                                    await logAction(
                                      t('logActionChangeRole'),
                                      `${t('logDetailsChangeRole')} ${u.displayName || u.email} ${t('to')} ${newRole}`,
                                      u.id,
                                      u.displayName || u.email
                                    );
                                  } catch (err) {
                                    handleFirestoreError(err, OperationType.UPDATE, `users/${u.id}`);
                                  }
                                }}
                                className="bg-slate-100 border-none rounded-lg py-1 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              >
                                <option value="user">{t('roleUser')}</option>
                                <option value="admin">{t('roleAdmin')}</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{t('auditLog')}</h3>
                      <p className="text-slate-500 text-sm">{t('auditLogDesc')}</p>
                    </div>
                    <button 
                      onClick={handleExportAuditLogsPDF}
                      disabled={isVerifying || auditLogs.length === 0}
                      className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {t('exportAuditLog')}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 text-xs uppercase font-bold tracking-wider">
                          <th className="px-6 py-4">{t('tableAction')}</th>
                          <th className="px-6 py-4">{t('tableDetails')}</th>
                          <th className="px-6 py-4">{t('tablePerformedBy')}</th>
                          <th className="px-6 py-4">{t('tableTimestamp')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="font-bold text-slate-800">{log.action}</span>
                            </td>
                            <td className="px-6 py-4 text-slate-600 text-sm max-w-xs truncate" title={log.details}>
                              {log.details}
                            </td>
                            <td className="px-6 py-4 text-slate-600 text-sm">
                              {log.performedByName}
                            </td>
                            <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                              {log.timestamp instanceof Timestamp ? 
                                log.timestamp.toDate().toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US') : 
                                new Date(log.timestamp).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                            </td>
                          </tr>
                        ))}
                        {auditLogs.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-6 py-10 text-center text-slate-400 italic">
                              {t('noLogs')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {showCropper && tempPhoto && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] overflow-hidden max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Crop className="w-6 h-6 text-blue-600" />
                  {t('editPlayerPhoto')}
                </h3>
                <button 
                  onClick={() => {
                    setShowCropper(false);
                    setTempPhoto(null);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              
              <div className="relative flex-1 bg-slate-900">
                <Cropper
                  image={tempPhoto}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>

              <div className="p-8 bg-white border-t border-slate-100 space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-bold text-slate-600">
                    <span>{t('zoom')}</span>
                    <span>{Math.round(zoom * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={handleSaveCrop}
                    className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    {t('saveChanges')}
                  </button>
                  <button
                    onClick={() => {
                      setShowCropper(false);
                      setTempPhoto(null);
                    }}
                    className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {playerToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-200 text-right"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">{t('confirmDelete')}</h3>
              <p className="text-slate-500 mb-8 leading-relaxed">
                {t('confirmDeleteMessage')}
              </p>
              <div className="flex flex-row-reverse gap-3">
                <button
                  onClick={() => handleDeletePlayer(playerToDelete)}
                  className="flex-1 py-3 px-6 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-200"
                >
                  {t('confirmDelete')}
                </button>
                <button
                  onClick={() => setPlayerToDelete(null)}
                  className="flex-1 py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all"
                >
                  {t('cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Add User Modal */}
        {showAddUserModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden text-right"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <button 
                  onClick={() => setShowAddUserModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors order-first"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{t('addUser')}</h3>
                    <p className="text-sm text-slate-500">{t('addUserDesc')}</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">{t('userName')}</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-right"
                    placeholder={language === 'ar' ? 'أدخل اسم المستخدم' : 'Enter user name'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">{t('userEmail')}</label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-right"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">{t('userRole')}</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setNewUserRole('user')}
                      className={cn(
                        "p-4 rounded-2xl border-2 transition-all font-bold text-center",
                        newUserRole === 'user' 
                          ? "border-blue-600 bg-blue-50 text-blue-600" 
                          : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                      )}
                    >
                      {t('roleUser')}
                    </button>
                    <button
                      onClick={() => setNewUserRole('admin')}
                      className={cn(
                        "p-4 rounded-2xl border-2 transition-all font-bold text-center",
                        newUserRole === 'admin' 
                          ? "border-purple-600 bg-purple-50 text-purple-600" 
                          : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                      )}
                    >
                      {t('roleAdmin')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-row-reverse gap-4">
                <button 
                  onClick={handleAddUser}
                  disabled={isVerifying}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
                >
                  {isVerifying ? t('processing') : t('addUserButton')}
                </button>
                <button 
                  onClick={() => setShowAddUserModal(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-2xl font-bold transition-all"
                >
                  {t('cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddPlayerModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl border border-slate-200 text-right my-8"
            >
              <div className="flex items-center justify-between mb-8 flex-row-reverse">
                <h3 className="text-2xl font-bold text-slate-900">{t('addPlayerManual')}</h3>
                <button 
                  onClick={() => {
                    setShowAddPlayerModal(false);
                    setFormErrors({});
                  }}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2 flex flex-col items-center justify-center space-y-4">
                  <label className="text-sm font-bold text-slate-700 block w-full">{t('playerPhoto')}</label>
                  <div 
                    className={cn(
                      "w-32 h-32 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group transition-all",
                      newPlayer.photoUrl.includes('picsum') ? "border-slate-200 hover:border-blue-400 bg-slate-50" : "border-blue-500 bg-blue-50"
                    )}
                    onClick={() => document.getElementById('manual-photo-input')?.click()}
                  >
                    {isProcessingFile.photo ? (
                      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    ) : (
                      <img src={newPlayer.photoUrl || undefined} alt="Player" className="w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                    <input 
                      id="manual-photo-input"
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setIsProcessingFile(prev => ({ ...prev, photo: true }));
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setNewPlayer(prev => ({ ...prev, photoUrl: reader.result as string }));
                            setIsProcessingFile(prev => ({ ...prev, photo: false }));
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">{t('clickToChange')}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 block">{t('playerName')}</label>
                  <input 
                    type="text" 
                    value={newPlayer.name}
                    onChange={(e) => setNewPlayer({...newPlayer, name: e.target.value})}
                    className={cn(
                      "w-full px-4 py-3 rounded-2xl border bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-right",
                      formErrors.name ? "border-red-300" : "border-slate-200"
                    )}
                    placeholder={t('playerNamePlaceholder')}
                  />
                  {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 block">{t('birthDate')}</label>
                  <input 
                    type="date" 
                    value={newPlayer.birthDate}
                    onChange={(e) => setNewPlayer({...newPlayer, birthDate: e.target.value})}
                    className={cn(
                      "w-full px-4 py-3 rounded-2xl border bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-right",
                      formErrors.birthDate ? "border-red-300" : "border-slate-200"
                    )}
                  />
                  {formErrors.birthDate && <p className="text-xs text-red-500 mt-1">{formErrors.birthDate}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 block">{t('governorate')}</label>
                  <select 
                    value={newPlayer.governorate}
                    onChange={(e) => setNewPlayer({...newPlayer, governorate: e.target.value})}
                    className={cn(
                      "w-full px-4 py-3 rounded-2xl border bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-right",
                      formErrors.governorate ? "border-red-300" : "border-slate-200"
                    )}
                  >
                    <option value="">{t('selectGovernorate')}</option>
                    {GOVERNORATES.map(gov => (
                      <option key={gov.ar} value={gov.ar}>{language === 'ar' ? gov.ar : gov.en}</option>
                    ))}
                  </select>
                  {formErrors.governorate && <p className="text-xs text-red-500 mt-1">{formErrors.governorate}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 block">{t('sport')}</label>
                  <select 
                    value={newPlayer.sport}
                    onChange={(e) => setNewPlayer({...newPlayer, sport: e.target.value})}
                    className={cn(
                      "w-full px-4 py-3 rounded-2xl border bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-right",
                      formErrors.sport ? "border-red-300" : "border-slate-200"
                    )}
                  >
                    <option value="">{t('selectSport')}</option>
                    {SPORTS.map(s => (
                      <option key={s.ar} value={s.ar}>{language === 'ar' ? s.ar : s.en}</option>
                    ))}
                  </select>
                  {formErrors.sport && <p className="text-xs text-red-500 mt-1">{formErrors.sport}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-700 block">{t('club')}</label>
                  <select 
                    value={newPlayer.club}
                    onChange={(e) => setNewPlayer({...newPlayer, club: e.target.value})}
                    className={cn(
                      "w-full px-4 py-3 rounded-2xl border bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-right",
                      formErrors.club ? "border-red-300" : "border-slate-200"
                    )}
                  >
                    <option value="">{t('selectClub')}</option>
                    {EGYPTIAN_CLUBS.map(c => (
                      <option key={c.ar} value={c.ar}>{language === 'ar' ? c.ar : c.en}</option>
                    ))}
                  </select>
                  {formErrors.club && <p className="text-xs text-red-500 mt-1">{formErrors.club}</p>}
                </div>
              </div>

              <div className="flex flex-row-reverse gap-3 mt-10">
                <button 
                  onClick={handleManualAddPlayer}
                  disabled={isVerifying}
                  className="flex-1 py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isVerifying && <Loader2 className="w-5 h-5 animate-spin" />}
                  {t('savePlayer')}
                </button>
                <button 
                  onClick={() => {
                    setShowAddPlayerModal(false);
                    setFormErrors({});
                  }}
                  className="flex-1 py-4 px-6 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all"
                >
                  {t('cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ 
  icon, 
  label, 
  active = false, 
  collapsed = false, 
  onClick 
}: { 
  icon: React.ReactElement, 
  label: string, 
  active?: boolean, 
  collapsed?: boolean,
  onClick?: () => void
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 p-3 rounded-xl transition-all group",
        active ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-400 hover:bg-white/5 hover:text-white"
      )}
    >
      <div className={cn(
        "transition-transform group-hover:scale-110",
        active ? "text-white" : "text-slate-400 group-hover:text-white"
      )}>
        {React.cloneElement(icon, { size: 24 } as any)}
      </div>
      {!collapsed && (
        <span className="font-medium text-sm whitespace-nowrap">{label}</span>
      )}
    </button>
  );
}

function StatCard({ title, value, icon, trend }: { title: string, value: string | number, icon: React.ReactNode, trend: string }) {
  const isPositive = trend.startsWith('+');
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 rounded-2xl bg-slate-50">
          {icon}
        </div>
        <span className={cn(
          "text-xs font-bold px-2 py-1 rounded-full",
          isPositive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
        )}>
          {trend}
        </span>
      </div>
      <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
      <p className="text-3xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

function StatusBadge({ status, language }: { status: Player['matchStatus'], language: Language }) {
  const styles = {
    match: "bg-emerald-50 text-emerald-600 border-emerald-100",
    suspicious: "bg-amber-50 text-amber-600 border-amber-100",
    mismatch: "bg-red-50 text-red-600 border-red-100"
  };

  return (
    <span className={cn(
      "px-3 py-1 rounded-full text-xs font-bold border",
      styles[status]
    )}>
      {translations[language][status]}
    </span>
  );
}

function ResultItem({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

function FileUpload({ 
  id, 
  label, 
  icon, 
  preview, 
  onUpload, 
  dragActive, 
  onDrag,
  isProcessing,
  language,
  t
}: { 
  id: string, 
  label: string, 
  icon: React.ReactNode, 
  preview: string | null, 
  onUpload: (data: string) => void,
  dragActive: boolean,
  onDrag: (active: boolean) => void,
  isProcessing: boolean,
  language: Language,
  t: (key: any) => string
}) {
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      onUpload(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div 
      className={cn(
        "border-2 border-dashed rounded-3xl h-72 flex flex-col items-center justify-center transition-all cursor-pointer overflow-hidden relative group",
        preview ? "border-blue-500 bg-blue-50/30" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50",
        dragActive && "border-blue-500 bg-blue-50 ring-4 ring-blue-500/10"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        onDrag(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        onDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrag(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
      onClick={() => document.getElementById(`${id}-input`)?.click()}
    >
      {isProcessing ? (
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-sm font-bold text-slate-700">{t('processing')}</p>
        </div>
      ) : preview ? (
        <div className="relative w-full h-full group">
          <img src={preview || undefined} alt="Preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <p className="text-white font-bold flex items-center gap-2"><Upload className="w-5 h-5" /> {t('changePhoto')}</p>
          </div>
        </div>
      ) : (
        <div className="text-center p-6">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            {React.cloneElement(icon as React.ReactElement<any>, { className: "w-8 h-8 text-blue-500" })}
          </div>
          <p className="text-sm font-bold text-slate-700">{label}</p>
        </div>
      )}
      <input 
        id={`${id}-input`} 
        type="file" 
        className="hidden" 
        accept="image/*" 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }} 
      />
    </div>
  );
}
