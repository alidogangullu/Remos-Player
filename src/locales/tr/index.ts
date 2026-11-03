import type { TranslationResources } from '../en';
import common from './common.json';
import app from './app.json';
import toast from './toast.json';
import home from './home.json';
import services from './services.json';
import nowPlaying from './nowPlaying.json';
import search from './search.json';
import favorites from './favorites.json';
import settings from './settings.json';
import system from './system.json';
import pro from './pro.json';

// Typed against English, so a missing key fails `tsc`.
const tr: TranslationResources = { common, app, toast, home, services, nowPlaying, search, favorites, settings, system, pro };

export default tr;
