import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services.ts', () => ({
    default: {
        generateAmapApiInternalProxyUrl: (): string => 'https://ezbookkeeping.example.com/_AMapService'
    }
}));

import { AmapMapInstance } from '../amap.ts';

import type { Coordinate } from '@/core/coordinate.ts';

const SHANGHAI_CENTER: Coordinate = { latitude: 31.228474, longitude: 121.478224 };

const NEARBY_PLACE = {
    name: 'nearby place',
    location: '121.49,31.23',
    address: 'nearby address',
    pname: '上海市',
    cityname: '上海市',
    adname: '黄浦区'
};

const NEARBY_PLACE2 = {
    name: 'nearby place 2',
    location: '121.6,31.3',
    address: 'nearby address 2',
    pname: '上海市',
    cityname: '上海市',
    adname: '浦东新区'
};

const REMOTE_PLACE = {
    name: 'remote place',
    location: '116.403743,39.910126',
    address: 'remote address',
    pname: '北京市',
    cityname: '北京市',
    adname: '西城区'
};

const REMOTE_PLACE2 = {
    name: 'remote place 2',
    location: '113.264385,23.129112',
    address: 'remote address 2',
    pname: '广东省',
    cityname: '广州市',
    adname: '越秀区'
};

let requestedUrls: string[] = [];

function stubFetch(options: {
    textPois?: unknown[];
    textStatus?: string;
    regeoAdcode?: string;
    regeoFailed?: boolean;
}): void {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        requestedUrls.push(url);

        if (url.includes('/v3/geocode/regeo')) {
            if (options.regeoFailed) {
                throw new Error('failed to request reverse geocoding');
            }

            return {
                json: async () => ({
                    status: '1',
                    regeocode: {
                        addressComponent: {
                            adcode: options.regeoAdcode,
                            citycode: '021'
                        }
                    }
                })
            };
        }

        return {
            json: async () => ({
                status: options.textStatus ?? '1',
                pois: options.textPois ?? []
            })
        };
    }));
}

function createMapInstance(center?: Coordinate | null): AmapMapInstance {
    const mapInstance = new AmapMapInstance({});
    const amapInstance: Record<string, unknown> = {};

    if (center) {
        amapInstance['getCenter'] = () => {
            return {
                getLng: () => center.longitude,
                getLat: () => center.latitude
            };
        };
    }

    (mapInstance as unknown as { amapInstance: unknown }).amapInstance = amapInstance;

    return mapInstance;
}

function getRequestedTextSearchUrl(): string {
    return requestedUrls.filter(url => url.includes('/v5/place/text'))[0] ?? '';
}

describe('AmapMapInstance.searchPlaces', () => {
    beforeEach(() => {
        requestedUrls = [];
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should search places with the region of the current map center', async () => {
        stubFetch({ textPois: [ NEARBY_PLACE2, REMOTE_PLACE, NEARBY_PLACE, REMOTE_PLACE2 ], regeoAdcode: '310101' });

        const places = await createMapInstance(SHANGHAI_CENTER).searchPlaces('咖啡');

        expect(requestedUrls[0]).toContain('/v3/geocode/regeo');
        expect(requestedUrls[0]).toContain('location=121.478224%2C31.228474');

        const textSearchUrl = getRequestedTextSearchUrl();
        expect(textSearchUrl).toContain('keywords=%E5%92%96%E5%95%A1');
        expect(textSearchUrl).toContain('region=310101');
        expect(places.map(place => place.name)).toEqual([ 'nearby place', 'nearby place 2', 'remote place', 'remote place 2' ]);
    });

    it('should sort the nearby places by distance and keep the order of the other places', async () => {
        stubFetch({ textPois: [ REMOTE_PLACE, NEARBY_PLACE2, NEARBY_PLACE, REMOTE_PLACE2 ], regeoAdcode: '310101' });

        const places = await createMapInstance(SHANGHAI_CENTER).searchPlaces('咖啡');

        expect(places.map(place => place.name)).toEqual([ 'nearby place', 'nearby place 2', 'remote place', 'remote place 2' ]);
    });

    it('should search places without region when the map center is not available', async () => {
        stubFetch({ textPois: [ REMOTE_PLACE, NEARBY_PLACE ] });

        const places = await createMapInstance(null).searchPlaces('咖啡');

        expect(requestedUrls.filter(url => url.includes('/v3/geocode/regeo'))).toHaveLength(0);
        expect(getRequestedTextSearchUrl()).not.toContain('region=');
        expect(places.map(place => place.name)).toEqual([ 'remote place', 'nearby place' ]);
    });

    it('should search places without region when the map has not been located yet', async () => {
        stubFetch({ textPois: [ REMOTE_PLACE, NEARBY_PLACE ] });

        const places = await createMapInstance({ latitude: 0, longitude: 0 }).searchPlaces('咖啡');

        expect(requestedUrls.filter(url => url.includes('/v3/geocode/regeo'))).toHaveLength(0);
        expect(getRequestedTextSearchUrl()).not.toContain('region=');
        expect(places.map(place => place.name)).toEqual([ 'remote place', 'nearby place' ]);
    });

    it('should search places without region when the reverse geocoding fails', async () => {
        stubFetch({ textPois: [ NEARBY_PLACE, REMOTE_PLACE ], regeoFailed: true });

        const places = await createMapInstance(SHANGHAI_CENTER).searchPlaces('咖啡');

        expect(getRequestedTextSearchUrl()).not.toContain('region=');
        expect(places.map(place => place.name)).toEqual([ 'nearby place', 'remote place' ]);
    });

    it('should return an empty list when the search request fails', async () => {
        stubFetch({ textStatus: '0', regeoAdcode: '310101' });

        const places = await createMapInstance(SHANGHAI_CENTER).searchPlaces('咖啡');

        expect(places).toEqual([]);
    });
});
