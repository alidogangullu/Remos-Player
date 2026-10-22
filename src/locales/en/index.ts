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

/** English is the source language: every other language must provide the same keys. */
const en = { common, app, toast, home, services, nowPlaying, search, favorites, settings, system };

export default en;
export type TranslationResources = typeof en;
