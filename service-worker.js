/* globals importScripts, workbox */
'use strict';
importScripts('https://storage.googleapis.com/workbox-cdn/releases/3.2.0/workbox-sw.js');
workbox.routing.registerRoute(
	new RegExp(`(${location.origin}|https://cdnjs.cloudflare.com)/.*`),
	workbox.strategies.staleWhileRevalidate()
);
