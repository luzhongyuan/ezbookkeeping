import type { Coordinate } from '@/core/coordinate.ts';

export interface MapPlace {
    readonly name: string;
    readonly address?: string;
    readonly province?: string;
    readonly city?: string;
    readonly district?: string;
    readonly latitude: number;
    readonly longitude: number;
}

export interface MapProvider {
    getWebsite(): string;
    isSupportGetGeoLocationByClick(): boolean;
    isSupportSearchPlaces(): boolean;
    asyncLoadAssets(language?: string): Promise<unknown>;
    createMapInstance(options: MapCreateOptions): MapInstance | null;
}

export interface MapInstance {
    dependencyLoaded: boolean;
    inited: boolean;
    initMapInstance(mapContainer: HTMLElement, options: MapInstanceInitOptions): void;
    getDefaultZoomLevel(): number;
    getMinZoomLevel(): number;
    getMaxZoomLevel(): number;
    getZoomLevel(): number;
    setMapCenterTo(center: Coordinate, zoomLevel: number): void;
    setMapCenterMarker(position: Coordinate): void;
    removeMapCenterMarker(): void;
    searchPlaces(keyword: string): Promise<MapPlace[]>;
    zoomIn(): void;
    zoomOut(): void;
}

export interface MapCreateOptions {
    readonly enableZoomControl?: boolean;
    readonly zoomControlPosition?: 'top' | 'bottom';
}

export interface MapInstanceInitOptions {
    readonly language?: string;
    readonly initCenter: Coordinate;
    readonly zoomLevel: number;
    readonly text: {
        readonly zoomIn: string;
        readonly zoomOut: string;
    };
    readonly onClick?: (position: Coordinate) => void;
    readonly onZoomChange?: (level: number) => void;
}
