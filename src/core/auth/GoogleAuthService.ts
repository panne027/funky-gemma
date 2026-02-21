import { Platform } from 'react-native';
import { aiLog } from '../logging/AILogger';
import { GOOGLE_WEB_CLIENT_ID } from '../config';

let GoogleSignin: any = null;
let statusCodes: any = null;

try {
  if (Platform.OS !== 'web') {
    const mod = require('@react-native-google-signin/google-signin');
    GoogleSignin = mod.GoogleSignin;
    statusCodes = mod.statusCodes;
  }
} catch {
  // Not available
}

export interface GoogleUser {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
  accessToken: string;
  idToken: string | null;
  scopes: string[];
}

class GoogleAuthServiceImpl {
  private _user: GoogleUser | null = null;
  private _configured = false;
  private _configFailed = false;
  private _listeners: Array<(user: GoogleUser | null) => void> = [];

  configure(webClientId?: string): boolean {
    if (this._configured) return true;
    if (this._configFailed) return false;
    if (!GoogleSignin) {
      this._configFailed = true;
      return false;
    }

    const clientId = webClientId || GOOGLE_WEB_CLIENT_ID || '';
    const hasClientId = clientId.length > 0 && !clientId.startsWith('YOUR_');

    try {
      const config: any = {
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/tasks',
          'https://www.googleapis.com/auth/tasks.readonly',
        ],
      };

      if (hasClientId) {
        config.webClientId = clientId;
        config.offlineAccess = true;
      } else {
        config.offlineAccess = false;
      }

      GoogleSignin.configure(config);
      this._configured = true;
      aiLog('agent', `Google Sign-In configured (webClientId: ${hasClientId ? 'yes' : 'none — basic mode'})`);
      return true;
    } catch (err) {
      this._configFailed = true;
      aiLog('agent', `Google Sign-In config failed: ${err}`);
      return false;
    }
  }

  async signIn(): Promise<GoogleUser | null> {
    if (!GoogleSignin) {
      aiLog('agent', 'Google Sign-In not available on this platform');
      return null;
    }

    if (!this._configured && !this.configure()) {
      aiLog('agent', 'Google Sign-In not configured — cannot sign in');
      return null;
    }

    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();

      this._user = {
        id: userInfo.data?.user?.id ?? userInfo.user?.id ?? '',
        name: userInfo.data?.user?.name ?? userInfo.user?.name ?? null,
        email: userInfo.data?.user?.email ?? userInfo.user?.email ?? '',
        photo: userInfo.data?.user?.photo ?? userInfo.user?.photo ?? null,
        accessToken: tokens.accessToken,
        idToken: tokens.idToken ?? null,
        scopes: ['calendar', 'calendar.events', 'tasks', 'tasks.readonly'],
      };

      aiLog('agent', `Signed in as ${this._user.email}`);
      this._listeners.forEach((l) => l(this._user));
      return this._user;
    } catch (err: any) {
      if (statusCodes && err.code === statusCodes.SIGN_IN_CANCELLED) {
        aiLog('agent', 'Sign-in cancelled by user');
      } else if (statusCodes && err.code === statusCodes.IN_PROGRESS) {
        aiLog('agent', 'Sign-in already in progress');
      } else if (statusCodes && err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        aiLog('agent', 'Play services not available');
      } else {
        aiLog('agent', `Sign-in error: ${err.message ?? err}`);
      }
      return null;
    }
  }

  async signInSilently(): Promise<GoogleUser | null> {
    if (!GoogleSignin) return null;
    if (!this._configured && !this.configure()) return null;

    try {
      const userInfo = await GoogleSignin.signInSilently();
      if (!userInfo) return null;
      const tokens = await GoogleSignin.getTokens();

      this._user = {
        id: userInfo.data?.user?.id ?? userInfo.user?.id ?? '',
        name: userInfo.data?.user?.name ?? userInfo.user?.name ?? null,
        email: userInfo.data?.user?.email ?? userInfo.user?.email ?? '',
        photo: userInfo.data?.user?.photo ?? userInfo.user?.photo ?? null,
        accessToken: tokens.accessToken,
        idToken: tokens.idToken ?? null,
        scopes: ['calendar', 'calendar.events', 'tasks', 'tasks.readonly'],
      };

      this._listeners.forEach((l) => l(this._user));
      return this._user;
    } catch {
      return null;
    }
  }

  async signOut(): Promise<void> {
    if (!GoogleSignin) return;
    try {
      await GoogleSignin.signOut();
      this._user = null;
      this._listeners.forEach((l) => l(null));
      aiLog('agent', 'Signed out');
    } catch (err) {
      aiLog('agent', `Sign-out error: ${err}`);
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (!GoogleSignin) return null;
    if (!this._user) return null;

    try {
      const tokens = await GoogleSignin.getTokens();
      this._user.accessToken = tokens.accessToken;
      return tokens.accessToken;
    } catch {
      const user = await this.signInSilently();
      return user?.accessToken ?? null;
    }
  }

  get currentUser(): GoogleUser | null {
    return this._user;
  }

  get isSignedIn(): boolean {
    return this._user !== null;
  }

  get isConfigured(): boolean {
    return this._configured;
  }

  subscribe(listener: (user: GoogleUser | null) => void): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }
}

export const googleAuth = new GoogleAuthServiceImpl();
