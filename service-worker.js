/* globals importScripts, workbox */
// eslint-disable-next-line unicorn/prefer-module -- TODO: Use and test ESM
'use strict';
importScripts('https://storage.googleapis.com/workbox-cdn/releases/3.2.0/workbox-sw.js');
workbox.routing.registerRoute(
	new RegExp(`(${location.origin}|https://cdn.skypack.dev)/.*`),
	workbox.strategies.staleWhileRevalidate(),
);
