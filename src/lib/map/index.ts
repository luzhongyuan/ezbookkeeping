import { getMapProvider } from '@/lib/server_settings.ts';

import type { MapProvider, MapInstance, MapCreateOptions } from './base.ts';
import { AmapMapProvider } from './amap.ts';

let mapProvider: MapProvider | null = null;

export function initMapProvider(language?: string): void {
    if (getMapProvider() === 'amap') {
        mapProvider = new AmapMapProvider();
    }

    if (mapProvider) {
        mapProvider.asyncLoadAssets(language);
    }
}

export function isMapProviderUseExternalSDK(): boolean {
    return mapProvider !== null;
}

export function getMapWebsite(): string {
    return mapProvider?.getWebsite() || '';
}

export function isSupportGetGeoLocationByClick(): boolean {
    return mapProvider?.isSupportGetGeoLocationByClick() || false;
}

export function isSupportSearchPlaces(): boolean {
    return mapProvider?.isSupportSearchPlaces() || false;
}

export function createMapInstance(options: MapCreateOptions): MapInstance | null {
    return mapProvider?.createMapInstance(options) || null;
}
