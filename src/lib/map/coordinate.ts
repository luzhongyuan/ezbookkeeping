import type { Coordinate } from '@/core/coordinate.ts';

// GCJ-02 / WGS-84 coordinate conversion, same algorithm as ChinaCoordinateConverter
const PI: number = Math.PI;
const AXIS: number = 6378245.0;
const OFFSET: number = 0.00669342162296594323;
const COORDINATE_SCALE: number = 6;
const MAX_INVERSE_ITERATIONS: number = 10;
const INVERSE_TOLERANCE: number = 1e-7;

export function gcj02ToWgs84(coordinate: Coordinate): Coordinate {
    const latitude = coordinate.latitude;
    const longitude = coordinate.longitude;

    if (outsideChina(latitude, longitude)) {
        return scaleCoordinate({ latitude, longitude });
    }

    let wgsLatitude = latitude;
    let wgsLongitude = longitude;

    for (let i = 0; i < MAX_INVERSE_ITERATIONS; i++) {
        const offset = calculateOffset(wgsLatitude, wgsLongitude);
        const latitudeError = wgsLatitude + offset.latitude - latitude;
        const longitudeError = wgsLongitude + offset.longitude - longitude;

        wgsLatitude -= latitudeError;
        wgsLongitude -= longitudeError;

        if (Math.abs(latitudeError) <= INVERSE_TOLERANCE && Math.abs(longitudeError) <= INVERSE_TOLERANCE) {
            break;
        }
    }

    return scaleCoordinate({ latitude: wgsLatitude, longitude: wgsLongitude });
}

function calculateOffset(latitude: number, longitude: number): Coordinate {
    let offsetLatitude = transformLatitude(longitude - 105.0, latitude - 35.0);
    let offsetLongitude = transformLongitude(longitude - 105.0, latitude - 35.0);
    const radLatitude = (latitude / 180.0) * PI;
    let magic = Math.sin(radLatitude);
    magic = 1 - OFFSET * magic * magic;
    const sqrtMagic = Math.sqrt(magic);

    offsetLatitude = (offsetLatitude * 180.0) / (((AXIS * (1 - OFFSET)) / (magic * sqrtMagic)) * PI);
    offsetLongitude = (offsetLongitude * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLatitude) * PI);

    return { latitude: offsetLatitude, longitude: offsetLongitude };
}

function transformLatitude(x: number, y: number): number {
    let result = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    result += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
    result += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
    result += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
    return result;
}

function transformLongitude(x: number, y: number): number {
    let result = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    result += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
    result += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
    result += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
    return result;
}

function outsideChina(latitude: number, longitude: number): boolean {
    return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function scaleCoordinate(coordinate: Coordinate): Coordinate {
    return {
        latitude: Number(coordinate.latitude.toFixed(COORDINATE_SCALE)),
        longitude: Number(coordinate.longitude.toFixed(COORDINATE_SCALE))
    };
}
