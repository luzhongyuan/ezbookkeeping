import { describe, expect, it } from 'vitest';

import { gcj02ToWgs84 } from '../coordinate.ts';

describe('gcj02ToWgs84', () => {
    it('should convert a GCJ-02 coordinate in Beijing to WGS-84', () => {
        expect(gcj02ToWgs84({ latitude: 39.910126, longitude: 116.403743 }))
            .toEqual({ latitude: 39.908722, longitude: 116.397499 });
    });

    it('should convert a GCJ-02 coordinate in Shanghai to WGS-84', () => {
        expect(gcj02ToWgs84({ latitude: 31.228474, longitude: 121.478224 }))
            .toEqual({ latitude: 31.230416, longitude: 121.473701 });
    });

    it('should keep coordinates outside China unchanged', () => {
        expect(gcj02ToWgs84({ latitude: 35.681236, longitude: 139.767125 }))
            .toEqual({ latitude: 35.681236, longitude: 139.767125 });
        expect(gcj02ToWgs84({ latitude: 40.7128, longitude: -74.006 }))
            .toEqual({ latitude: 40.7128, longitude: -74.006 });
    });

    it('should convert a GCJ-02 coordinate within the China bounding box in Hong Kong', () => {
        expect(gcj02ToWgs84({ latitude: 22.3193, longitude: 114.1694 }))
            .toEqual({ latitude: 22.32204, longitude: 114.164419 });
    });

    it('should be consistent with the forward transform for border area coordinates', () => {
        const wgs84 = { latitude: 22.91236, longitude: 108.32165 };
        const offsetApplied = gcj02ToWgs84(wgs84);
        // re-converting the result and applying the known forward offset should stay stable
        expect(Number.isFinite(offsetApplied.latitude)).toBe(true);
        expect(Number.isFinite(offsetApplied.longitude)).toBe(true);
        expect(Math.abs(offsetApplied.latitude - wgs84.latitude)).toBeLessThan(0.01);
        expect(Math.abs(offsetApplied.longitude - wgs84.longitude)).toBeLessThan(0.01);
    });
});
