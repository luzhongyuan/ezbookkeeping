// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import type { Coordinate } from '@/core/coordinate.ts';
import type { MapProvider, MapInstance, MapCreateOptions, MapInstanceInitOptions, MapPlace } from './base.ts';

import { isFunction, isArray } from '@/lib/common.ts';
import { gcj02ToWgs84, getCoordinateDistance } from '@/lib/map/coordinate.ts';
import { asyncLoadAssets } from '@/lib/misc.ts';
import services from '@/lib/services.ts';
import {
    getAmapSecurityVerificationMethod,
    getAmapApiExternalProxyUrl,
    getAmapApplicationSecret
} from '@/lib/server_settings.ts';
import logger from '@/lib/logger.ts';

const SEARCH_RESULT_COUNT: number = 10;
const NEARBY_DISTANCE_LIMIT: number = 50000;
const REGION_CACHE_COORDINATE_TOLERANCE: number = 0.01;

function parseAmapStringField(field: string | string[] | undefined): string | undefined {
    if (isArray(field)) {
        return field.length > 0 ? field[0] : undefined;
    }

    return field;
}

export class AmapMapProvider implements MapProvider {
    // https://lbs.amap.com/api/javascript-api-v2/documentation
    public static AMap: unknown = null;

    public getWebsite(): string {
        return 'https://www.amap.com';
    }

    public isSupportGetGeoLocationByClick(): boolean {
        return true;
    }

    public isSupportSearchPlaces(): boolean {
        return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public asyncLoadAssets(language?: string): Promise<unknown> {
        if (AmapMapProvider.AMap) {
            return Promise.resolve();
        }

        if (!window._AMapSecurityConfig) {
            const amapSecurityConfig = {};

            if (getAmapSecurityVerificationMethod() === 'internal_proxy') {
                amapSecurityConfig.serviceHost = services.generateAmapApiInternalProxyUrl();
            } else if (getAmapSecurityVerificationMethod() === 'external_proxy') {
                amapSecurityConfig.serviceHost = getAmapApiExternalProxyUrl();
            } else if (getAmapSecurityVerificationMethod() === 'plain_text') {
                amapSecurityConfig.securityJsCode = getAmapApplicationSecret();
            }

            window._AMapSecurityConfig = amapSecurityConfig;
        }

        if (!window.onAMapCallback) {
            window.onAMapCallback = () => {
                AmapMapProvider.AMap = window.AMap;
            };
        }

        return asyncLoadAssets('js', services.generateAmapJavascriptUrl('onAMapCallback'));
    }

    public createMapInstance(options: MapCreateOptions): MapInstance | null {
        return new AmapMapInstance(options);
    }
}

export class AmapMapInstance implements MapInstance {
    public dependencyLoaded: boolean = false;
    public inited: boolean = false;

    private readonly defaultZoomLevel: number = 14;
    private readonly minZoomLevel: number = 2;
    private readonly maxZoomLevel: number = 19;

    private readonly mapCreateOptions: MapCreateOptions;
    private amapInstance: unknown = null;
    private amapToolbar: unknown = null;
    private amapCenterPosition: unknown = null;
    private amapCenterMarker: unknown | null;
    private regionByCoordinate: { latitude: number; longitude: number; region: string } | null = null;

    public constructor(options: MapCreateOptions) {
        this.dependencyLoaded = !!AmapMapProvider.AMap;
        this.mapCreateOptions = options;
    }

    public initMapInstance(mapContainer: HTMLElement, options: MapInstanceInitOptions): void {
        if (!AmapMapProvider.AMap) {
            return;
        }

        const AMap = AmapMapProvider.AMap;
        const amapInstance = new AMap.Map(mapContainer, {
            zoom: options.zoomLevel,
            center: [ options.initCenter.longitude, options.initCenter.latitude ],
            zooms: [ 1, 19 ],
            jogEnable: false
        });

        if (this.mapCreateOptions.enableZoomControl) {
            this.amapToolbar = new AMap.ToolBar({
                position: this.mapCreateOptions.zoomControlPosition === 'bottom' ? 'LB' : 'LT'
            });
            amapInstance.addControl(this.amapToolbar);
        }

        amapInstance.on('click', function(e) {
            if (options.onClick) {
                options.onClick(gcj02ToWgs84({
                    latitude: e.lnglat.lat,
                    longitude: e.lnglat.lng
                }));
            }
        });

        amapInstance.on('zoomend', function() {
            if (options.onZoomChange && isFunction(amapInstance.getZoom)) {
                options.onZoomChange(amapInstance.getZoom());
            }
        });

        this.amapInstance = amapInstance;
        this.inited = true;
    }

    public getDefaultZoomLevel(): number {
        return this.defaultZoomLevel;
    }

    public getMinZoomLevel(): number {
        if (!this.amapInstance || !isFunction(this.amapInstance.getZooms)) {
            return this.minZoomLevel;
        }

        const zooms = this.amapInstance.getZooms();

        if (!zooms || !isArray(zooms) || zooms.length !== 2) {
            return this.minZoomLevel;
        }

        return zooms[0];
    }

    public getMaxZoomLevel(): number {
        if (!this.amapInstance || !isFunction(this.amapInstance.getZooms)) {
            return this.maxZoomLevel;
        }

        const zooms = this.amapInstance.getZooms();

        if (!zooms || !isArray(zooms) || zooms.length !== 2) {
            return this.maxZoomLevel;
        }

        return zooms[1];
    }

    public getZoomLevel(): number {
        if (!this.amapInstance || !isFunction(this.amapInstance.getZoom)) {
            return this.defaultZoomLevel;
        }

        return this.amapInstance?.getZoom() ?? this.defaultZoomLevel;
    }

    public setMapCenterTo(center: Coordinate, zoomLevel: number): void {
        if (!AmapMapProvider.AMap || !this.amapInstance) {
            return;
        }

        const AMap = AmapMapProvider.AMap;

        if (this.amapCenterPosition
            && this.amapCenterPosition.originalLongitude === center.longitude
            && this.amapCenterPosition.originalLatitude === center.latitude
            && this.amapCenterPosition.convertedLongitude
            && this.amapCenterPosition.convertedLatitude
        ) {
            this.amapInstance.setZoomAndCenter(zoomLevel, new AMap.LngLat(this.amapCenterPosition.convertedLongitude, this.amapCenterPosition.convertedLatitude));
            return;
        }

        this.amapCenterPosition = {
            originalLongitude: center.longitude,
            originalLatitude: center.latitude,
            convertedLongitude: null,
            convertedLatitude: null
        };

        const centerPoint = new AMap.LngLat(center.longitude, center.latitude);

        AMap.convertFrom(centerPoint, 'gps', (status, result) => {
            let convertedCenterPoint = centerPoint;

            if (result.info !== 'ok' || !result.locations) {
                logger.warn('amap geo position convert failed');
            } else {
                convertedCenterPoint = result.locations[0];
                this.amapCenterPosition.convertedLongitude = convertedCenterPoint.getLng();
                this.amapCenterPosition.convertedLatitude = convertedCenterPoint.getLat();
            }

            this.amapInstance.setZoomAndCenter(zoomLevel, convertedCenterPoint);
        });
    }

    public setMapCenterMarker(position: Coordinate): void {
        if (!AmapMapProvider.AMap || !this.amapInstance) {
            return;
        }

        const AMap = AmapMapProvider.AMap;

        if (this.amapCenterPosition
            && this.amapCenterPosition.originalLongitude === position.longitude
            && this.amapCenterPosition.originalLatitude === position.latitude
            && this.amapCenterPosition.convertedLongitude
            && this.amapCenterPosition.convertedLatitude
        ) {
            this.setMaker(new AMap.LngLat(this.amapCenterPosition.convertedLongitude, this.amapCenterPosition.convertedLatitude));
            return;
        }

        const markerPoint = new AMap.LngLat(position.longitude, position.latitude);

        AMap.convertFrom(markerPoint, 'gps', (status, result) => {
            let convertedMarkPoint = markerPoint;

            if (result.info !== 'ok' || !result.locations) {
                logger.warn('amap geo position convert failed');
            } else {
                convertedMarkPoint = result.locations[0];
            }

            this.setMaker(convertedMarkPoint);
        });
    }

    public removeMapCenterMarker(): void {
        if (!this.amapInstance || !this.amapCenterMarker) {
            return;
        }

        this.amapInstance.remove(this.amapCenterMarker);
        this.amapCenterMarker = null;
    }

    public async searchPlaces(keyword: string): Promise<MapPlace[]> {
        const center = this.getCurrentMapCenter();
        const region = center ? await this.getRegionByCoordinate(center) : '';
        const places = await this.searchPlacesByKeyword(keyword, region);

        if (!center || places.length < 2) {
            return places;
        }

        // the keyword search api of amap cannot sort the results by distance, so the places around the
        // current map center are moved to the front of the result list after the search request is completed
        const centerInWgs84 = gcj02ToWgs84(center);

        return places.sort((place1: MapPlace, place2: MapPlace) => {
            const distance1 = getCoordinateDistance(centerInWgs84, place1);
            const distance2 = getCoordinateDistance(centerInWgs84, place2);

            if (distance1 <= NEARBY_DISTANCE_LIMIT && distance2 <= NEARBY_DISTANCE_LIMIT) {
                return distance1 - distance2;
            } else if (distance1 <= NEARBY_DISTANCE_LIMIT) {
                return -1;
            } else if (distance2 <= NEARBY_DISTANCE_LIMIT) {
                return 1;
            }

            // keep the original relevance order for the places which are not around the current map center
            return 0;
        });
    }

    private async searchPlacesByKeyword(keyword: string, region: string): Promise<MapPlace[]> {
        const params = new URLSearchParams();
        params.set('keywords', keyword);
        params.set('page_size', String(SEARCH_RESULT_COUNT));
        params.set('page_num', '1');
        params.set('show_fields', 'business');

        if (region) {
            params.set('region', region);
        }

        const url = `${services.generateAmapApiInternalProxyUrl()}/v5/place/text?${params.toString()}`;
        const response = await fetch(url, { credentials: 'include' });
        const result = await response.json();

        if (!result || result.status !== '1' || !result.pois || !isArray(result.pois)) {
            return [];
        }

        const places: MapPlace[] = [];

        for (const poi of result.pois) {
            const [ longitude, latitude ] = String(poi.location ?? '').split(',').map(Number);

            if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
                continue;
            }

            const wgs84Location = gcj02ToWgs84({
                latitude: latitude,
                longitude: longitude
            });

            places.push({
                name: parseAmapStringField(poi.name),
                address: parseAmapStringField(poi.address),
                province: parseAmapStringField(poi.pname),
                city: parseAmapStringField(poi.cityname),
                district: parseAmapStringField(poi.adname),
                latitude: wgs84Location.latitude,
                longitude: wgs84Location.longitude
            });
        }

        return places;
    }

    // the keyword search api of amap supports neither "location" nor "sortrule", the only way to prefer the
    // places around a coordinate is to pass the region (which is the district or the city of that coordinate)
    private async getRegionByCoordinate(coordinate: Coordinate): Promise<string> {
        if (this.regionByCoordinate
            && Math.abs(this.regionByCoordinate.latitude - coordinate.latitude) <= REGION_CACHE_COORDINATE_TOLERANCE
            && Math.abs(this.regionByCoordinate.longitude - coordinate.longitude) <= REGION_CACHE_COORDINATE_TOLERANCE
        ) {
            return this.regionByCoordinate.region;
        }

        const params = new URLSearchParams();
        params.set('location', `${coordinate.longitude},${coordinate.latitude}`);
        params.set('radius', '1000');
        params.set('extensions', 'base');

        let region = '';

        try {
            const url = `${services.generateAmapApiInternalProxyUrl()}/v3/geocode/regeo?${params.toString()}`;
            const response = await fetch(url, { credentials: 'include' });
            const result = await response.json();
            const addressComponent = result?.regeocode?.addressComponent;

            region = parseAmapStringField(addressComponent?.adcode) || parseAmapStringField(addressComponent?.citycode) || '';
        } catch (error) {
            logger.warn('amap reverse geocode failed', error);
        }

        this.regionByCoordinate = {
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            region: region
        };

        return region;
    }

    private getCurrentMapCenter(): Coordinate | null {
        if (!this.amapInstance || !isFunction(this.amapInstance.getCenter)) {
            return null;
        }

        const center = this.amapInstance.getCenter();

        if (!center || !isFunction(center.getLng) || !isFunction(center.getLat)) {
            return null;
        }

        const longitude = Number(center.getLng());
        const latitude = Number(center.getLat());

        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
            return null;
        }

        // the map has not been located yet if the center is still the initial coordinate
        if (!longitude && !latitude) {
            return null;
        }

        return { latitude: latitude, longitude: longitude };
    }

    public zoomIn(): void {
        if (!this.amapInstance) {
            return;
        }

        this.amapInstance.zoomIn();
    }

    public zoomOut(): void {
        if (!this.amapInstance) {
            return;
        }

        this.amapInstance.zoomOut();
    }

    private setMaker(point: unknown): void {
        if (!AmapMapProvider.AMap || !this.amapInstance) {
            return;
        }

        const AMap = AmapMapProvider.AMap;

        if (!this.amapCenterMarker) {
            this.amapCenterMarker = new AMap.Marker({
                position: point
            });
            this.amapInstance.add(this.amapCenterMarker);
        } else {
            this.amapCenterMarker.setPosition(point);
        }
    }
}
