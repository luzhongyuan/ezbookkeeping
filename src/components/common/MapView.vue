<template>
    <div :class="'map-view-container' + (mapClass ? ` ${mapClass}` : '')" :style="finalMapStyle">
        <div ref="mapCanvas" class="map-view-canvas"></div>
        <div class="map-view-search-panel" v-if="searchEnabled">
            <input class="map-view-search-input" type="text" autocomplete="off" enterkeyhint="search"
                   :placeholder="tt('Search places')" :disabled="searching"
                   v-model="searchKeyword" @keydown.enter="search" />
            <button type="button" class="map-view-search-button"
                    :disabled="searching || !searchKeyword || !searchKeyword.trim()"
                    @click="search">{{ tt('Search') }}</button>
        </div>
        <div class="map-view-search-results" v-if="searchEnabled && (searchFailed || searchResults !== null)">
            <template v-if="searchFailed">
                <div class="map-view-search-message">{{ tt('Failed to search places') }}</div>
            </template>
            <template v-else-if="searchResults && searchResults.length">
                <button type="button" class="map-view-search-result-item" :key="idx"
                        v-for="(place, idx) in searchResults" @click="selectSearchResult(place)">
                    <div class="map-view-search-result-name">{{ place.name }}</div>
                    <div class="map-view-search-result-address" v-if="getSearchResultAddress(place)">{{ getSearchResultAddress(place) }}</div>
                </button>
            </template>
            <template v-else>
                <div class="map-view-search-message">{{ tt('No data') }}</div>
            </template>
        </div>
    </div>
    <slot name="error-title"
          :mapSupported="mapSupported" :mapDependencyLoaded="mapDependencyLoaded"
          v-if="!mapSupported || !mapDependencyLoaded"></slot>
    <slot name="error-content"
          :mapSupported="mapSupported" :mapDependencyLoaded="mapDependencyLoaded"
          v-if="!mapSupported || !mapDependencyLoaded"></slot>
</template>

<script setup lang="ts">
import { ref, computed, useTemplateRef } from 'vue';

import { useI18n } from '@/locales/helpers.ts';

import type { Coordinate } from '@/core/coordinate.ts';
import { isNumber } from '@/lib/common.ts';
import type { MapInstance, MapPlace } from '@/lib/map/base.ts';
import { createMapInstance, isSupportSearchPlaces } from '@/lib/map/index.ts';
import logger from '@/lib/logger.ts';

const props = defineProps<{
    height?: string;
    mapClass?: string;
    mapStyle?: Record<string, string>;
    enableZoomControl?: boolean;
    enableSearch?: boolean;
    locateCurrentPosition?: boolean;
    geoLocation?: Coordinate;
}>();

const emit = defineEmits<{
    (e: 'click', geoLocation: Coordinate): void;
    (e: 'select', place: MapPlace): void;
}>();

const { tt, getCurrentLanguageInfo } = useI18n();

const mapCanvas = useTemplateRef<HTMLElement>('mapCanvas');
const mapInstance = ref<MapInstance | null>(createMapInstance({
    enableZoomControl: props.enableZoomControl,
    zoomControlPosition: props.enableSearch && isSupportSearchPlaces() ? 'bottom' : 'top'
}));
const initCenter = ref<Coordinate>({
    latitude: 0,
    longitude: 0
});
const zoomLevel = ref<number>(1);
const currentPosition = ref<Coordinate | undefined>(undefined);
const currentPositionRequested = ref<boolean>(false);
const searchKeyword = ref<string>('');
const searching = ref<boolean>(false);
const searchResults = ref<MapPlace[] | null>(null);
const searchFailed = ref<boolean>(false);

const mapSupported = computed<boolean>(() => !!mapInstance.value);
const mapDependencyLoaded = computed<boolean>(() => mapInstance.value?.dependencyLoaded || false);

const searchEnabled = computed<boolean>(() => !!props.enableSearch && isSupportSearchPlaces() && mapSupported.value && mapDependencyLoaded.value);

const finalMapStyle = computed<Record<string, string>>(() => {
    const styles: Record<string, string> = Object.assign({}, props.mapStyle);

    if (props.height) {
        styles['height'] = props.height;
    }

    if (!mapSupported.value || !mapDependencyLoaded.value) {
        styles['height'] = '0';
    }

    return styles;
});

function initMapView(): void {
    let isFirstInit = false;
    let centerChanged = false;

    if (!mapSupported.value || !mapDependencyLoaded.value || !mapInstance.value) {
        return;
    }

    const targetLocation = getTargetGeoLocation();

    if (targetLocation) {
        if (initCenter.value.latitude !== targetLocation.latitude || initCenter.value.longitude !== targetLocation.longitude) {
            initCenter.value.latitude = targetLocation.latitude;
            initCenter.value.longitude = targetLocation.longitude;
            zoomLevel.value = mapInstance.value.getDefaultZoomLevel();

            centerChanged = true;
        }
    } else if (initCenter.value.latitude || initCenter.value.longitude) {
        initCenter.value.latitude = 0;
        initCenter.value.longitude = 0;
        zoomLevel.value = mapInstance.value.getMinZoomLevel();

        centerChanged = true;
    }

    if (!mapInstance.value.inited) {
        const languageInfo = getCurrentLanguageInfo();

        mapInstance.value.initMapInstance(mapCanvas.value as HTMLElement, {
            language: languageInfo?.alternativeLanguageTag,
            initCenter: initCenter.value,
            zoomLevel: zoomLevel.value,
            text: {
                zoomIn: tt('Zoom in'),
                zoomOut: tt('Zoom out'),
            },
            onClick: (geoLocation: Coordinate) => {
                emit('click', geoLocation);
            },
            onZoomChange(level: number) {
                if (isNumber(level)) {
                    zoomLevel.value = level;
                } else if (mapInstance.value) {
                    zoomLevel.value = Math.round(mapInstance.value.getZoomLevel());
                }
            },
        });

        if (mapInstance.value.inited) {
            isFirstInit = true;
        }
    }

    if (isFirstInit || centerChanged) {
        mapInstance.value.setMapCenterTo(initCenter.value, zoomLevel.value);
    }

    if (centerChanged && zoomLevel.value > mapInstance.value.getMinZoomLevel()) {
        mapInstance.value.setMapCenterMarker(initCenter.value);
    } else if (centerChanged && zoomLevel.value <= mapInstance.value.getMinZoomLevel()) {
        mapInstance.value.removeMapCenterMarker();
    }

    locateCurrentPositionIfNeeded();
}

function getTargetGeoLocation(): Coordinate | undefined {
    if (props.geoLocation && (props.geoLocation.latitude || props.geoLocation.longitude)) {
        return props.geoLocation;
    }

    return currentPosition.value;
}

function locateCurrentPositionIfNeeded(): void {
    if (!props.locateCurrentPosition || currentPositionRequested.value) {
        return;
    }

    if (getTargetGeoLocation() || !navigator.geolocation) {
        return;
    }

    currentPositionRequested.value = true;

    navigator.geolocation.getCurrentPosition(function (position) {
        if (!position || !position.coords) {
            logger.warn('current position is null');
            return;
        }

        if (getTargetGeoLocation()) {
            return;
        }

        currentPosition.value = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        };

        initMapView();
    }, function (err) {
        logger.warn('cannot retrieve current position', err);
    });
}

function setMarkerPosition(geoLocation?: Coordinate): void {
    if (!mapInstance.value) {
        return;
    }

    if (geoLocation) {
        mapInstance.value.setMapCenterMarker(geoLocation);
    }
}

function removeMarker(): void {
    mapInstance.value?.removeMapCenterMarker();
}

function search(): void {
    const keyword = searchKeyword.value?.trim();

    if (!keyword || !mapInstance.value || !mapInstance.value.inited) {
        return;
    }

    searching.value = true;
    searchFailed.value = false;

    mapInstance.value.searchPlaces(keyword).then(places => {
        searchResults.value = places;
    }).catch(error => {
        logger.warn('map place search failed', error);
        searchResults.value = null;
        searchFailed.value = true;
    }).finally(() => {
        searching.value = false;
    });
}

function selectSearchResult(place: MapPlace): void {
    const coordinate: Coordinate = {
        latitude: place.latitude,
        longitude: place.longitude
    };

    if (mapInstance.value) {
        mapInstance.value.setMapCenterTo(coordinate, mapInstance.value.getDefaultZoomLevel());
        mapInstance.value.setMapCenterMarker(coordinate);
    }

    searchResults.value = null;

    emit('select', place);
}

function getSearchResultAddress(place: MapPlace): string {
    const parts: string[] = [];

    for (const part of [place.province, place.city, place.district, place.address]) {
        if (part && parts[parts.length - 1] !== part) {
            parts.push(part);
        }
    }

    return parts.join(' ');
}

function allowZoomIn(): boolean {
    if (!mapSupported.value || !mapDependencyLoaded.value || !mapInstance.value) {
        return false;
    }

    return zoomLevel.value < mapInstance.value.getMaxZoomLevel();
}

function allowZoomOut(): boolean {
    if (!mapSupported.value || !mapDependencyLoaded.value || !mapInstance.value) {
        return false;
    }

    return zoomLevel.value > mapInstance.value.getMinZoomLevel();
}

function zoomIn(): void {
    if (!mapInstance.value) {
        return;
    }

    mapInstance.value.zoomIn();
}

function zoomOut(): void {
    if (!mapInstance.value) {
        return;
    }

    mapInstance.value.zoomOut();
}

defineExpose({
    initMapView,
    setMarkerPosition,
    removeMarker,
    allowZoomIn,
    allowZoomOut,
    zoomIn,
    zoomOut
});
</script>

<style>
.map-view-container {
    width: 100%;
    position: relative;
}

.map-view-canvas {
    width: 100%;
    height: 100%;
}

.map-view-search-panel {
    position: absolute;
    top: 10px;
    left: 10px;
    right: 10px;
    z-index: 1000;
    display: flex;
    align-items: center;
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    overflow: hidden;
}

.map-view-search-input {
    flex: 1 1 auto;
    min-width: 0;
    height: 38px;
    padding: 0 12px;
    border: none;
    outline: none;
    background-color: transparent;
    color: rgba(0, 0, 0, 0.87);
    font-family: inherit;
    font-size: 14px;
}

.map-view-search-input::placeholder {
    color: rgba(0, 0, 0, 0.38);
}

.map-view-search-button {
    flex: 0 0 auto;
    height: 38px;
    padding: 0 14px;
    border: none;
    background-color: transparent;
    color: var(--f7-theme-color, rgb(var(--v-theme-primary, #1976d2)));
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
}

.map-view-search-button:disabled {
    opacity: 0.5;
    cursor: default;
}

.map-view-search-results {
    position: absolute;
    top: 54px;
    left: 10px;
    right: 10px;
    z-index: 1000;
    max-height: 240px;
    overflow-y: auto;
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.map-view-search-result-item {
    display: block;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    background-color: transparent;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
}

.map-view-search-result-item:last-child {
    border-bottom: none;
}

.map-view-search-result-item:hover,
.map-view-search-result-item:active {
    background-color: rgba(0, 0, 0, 0.05);
}

.map-view-search-result-name {
    color: rgba(0, 0, 0, 0.87);
    font-size: 14px;
}

.map-view-search-result-address {
    color: rgba(0, 0, 0, 0.54);
    font-size: 12px;
    margin-top: 2px;
}

.map-view-search-message {
    padding: 10px 12px;
    color: rgba(0, 0, 0, 0.54);
    font-size: 14px;
}
</style>
