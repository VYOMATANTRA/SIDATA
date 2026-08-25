import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import {
  listPoints,
  getPoint,
  listRtLeaders,
  getRtLeader,
  getSummary,
} from '../controllers/maps.controller.js';
import prisma from '../utils/prisma.js';
import { fakeRes } from './helpers/fakeRes.js';

describe('maps.controller', () => {
  const sampleKetuaRtPoint = {
    id: 'point-rt-1',
    name: 'Pos RT 01',
    type: 'ketua_rt' as const,
    latitude: -1.2235,
    longitude: 116.9521,
    metadata: { note: 'Posyandu' },
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    rtCoverages: [
      {
        rtNumber: 1,
        rtLeader: {
          rtNumber: 1,
          name: 'Bambang Supriyanto',
          phone: '081234567801',
          phoneIsWhatsapp: true,
          alamat: 'Jl. Mulawarman No. 12',
        },
      },
    ],
  };

  const sampleBankSampahPoint = {
    id: 'point-bs-1',
    name: 'Bank Sampah Sejahtera',
    type: 'bank_sampah' as const,
    latitude: -1.225,
    longitude: 116.955,
    metadata: { jadwal: 'Minggu 09:00' },
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    rtCoverages: [
      {
        rtNumber: 1,
        rtLeader: {
          rtNumber: 1,
          name: 'Bambang Supriyanto',
          phone: '081234567801',
          phoneIsWhatsapp: true,
          alamat: 'Jl. Mulawarman No. 12',
        },
      },
      { rtNumber: 2, rtLeader: null },
      { rtNumber: 3, rtLeader: null },
    ],
  };

  describe('listPoints', () => {
    it('returns all points with standard JSON structure and isolates rtLeader to ketua_rt', async () => {
      const originalFindMany = prisma.spatialPoint.findMany;
      prisma.spatialPoint.findMany = (async () => [
        sampleKetuaRtPoint,
        sampleBankSampahPoint,
      ]) as unknown as typeof prisma.spatialPoint.findMany;

      try {
        const req = { query: {} } as unknown as Request;
        const res = fakeRes();

        await listPoints(req, res as unknown as Response);

        assert.equal(res.status, 200);
        const body = res.body as {
          points: Array<{
            name: string;
            rts: number[];
            rtLeader: { name: string; rtNumber: number } | null;
          }>;
          total: number;
        };
        assert.equal(body.total, 2);
        assert.equal(body.points[0]?.name, 'Pos RT 01');
        assert.deepEqual(body.points[0]?.rts, [1]);
        assert.equal(body.points[0]?.rtLeader?.name, 'Bambang Supriyanto');

        // Multi-RT bank_sampah points must have rtLeader: null even if rtCoverages has leaders
        assert.equal(body.points[1]?.name, 'Bank Sampah Sejahtera');
        assert.deepEqual(body.points[1]?.rts, [1, 2, 3]);
        assert.equal(body.points[1]?.rtLeader, null);
      } finally {
        prisma.spatialPoint.findMany = originalFindMany;
      }
    });

    it('returns GeoJSON FeatureCollection when format=geojson', async () => {
      const originalFindMany = prisma.spatialPoint.findMany;
      prisma.spatialPoint.findMany = (async () => [
        sampleKetuaRtPoint,
      ]) as unknown as typeof prisma.spatialPoint.findMany;

      try {
        const req = { query: { format: 'geojson' } } as unknown as Request;
        const res = fakeRes();

        await listPoints(req, res as unknown as Response);

        assert.equal(res.status, 200);
        const body = res.body as {
          type: string;
          features: Array<{
            type: string;
            geometry: { type: string; coordinates: [number, number] };
            properties: { name: string; type: string };
          }>;
        };

        assert.equal(body.type, 'FeatureCollection');
        assert.equal(body.features.length, 1);
        assert.equal(body.features[0]?.type, 'Feature');
        assert.equal(body.features[0]?.geometry.type, 'Point');
        // RFC 7946 GeoJSON format requires [longitude, latitude]
        assert.deepEqual(body.features[0]?.geometry.coordinates, [116.9521, -1.2235]);
        assert.equal(body.features[0]?.properties.name, 'Pos RT 01');
      } finally {
        prisma.spatialPoint.findMany = originalFindMany;
      }
    });

    it('filters points by type and handles invalid type with 400', async () => {
      const res1 = fakeRes();
      await listPoints(
        { query: { type: 'invalid_type' } } as unknown as Request,
        res1 as unknown as Response,
      );
      assert.equal(res1.status, 400);

      const originalFindMany = prisma.spatialPoint.findMany;
      let capturedWhere: Record<string, unknown> | undefined;
      prisma.spatialPoint.findMany = (async (args: { where: Record<string, unknown> }) => {
        capturedWhere = args.where;
        return [sampleBankSampahPoint];
      }) as unknown as typeof prisma.spatialPoint.findMany;

      try {
        const res2 = fakeRes();
        await listPoints(
          { query: { type: 'bank_sampah' } } as unknown as Request,
          res2 as unknown as Response,
        );
        assert.equal(res2.status, 200);
        assert.equal(capturedWhere?.type, 'bank_sampah');
      } finally {
        prisma.spatialPoint.findMany = originalFindMany;
      }
    });

    it('filters points by RT number and rejects invalid RT number with 400', async () => {
      const res1 = fakeRes();
      await listPoints(
        { query: { rt: 'not-a-number' } } as unknown as Request,
        res1 as unknown as Response,
      );
      assert.equal(res1.status, 400);

      const originalFindMany = prisma.spatialPoint.findMany;
      let capturedWhere: { rtCoverages?: { some: { rtNumber: number } } } | undefined;
      prisma.spatialPoint.findMany = (async (args: {
        where: { rtCoverages?: { some: { rtNumber: number } } };
      }) => {
        capturedWhere = args.where;
        return [sampleKetuaRtPoint];
      }) as unknown as typeof prisma.spatialPoint.findMany;

      try {
        const res2 = fakeRes();
        await listPoints({ query: { rt: '1' } } as unknown as Request, res2 as unknown as Response);
        assert.equal(res2.status, 200);
        assert.equal(capturedWhere?.rtCoverages?.some?.rtNumber, 1);
      } finally {
        prisma.spatialPoint.findMany = originalFindMany;
      }
    });
  });

  describe('getPoint', () => {
    it('returns a single spatial point by ID with rtLeader for ketua_rt and null for multi-rt', async () => {
      const originalFindUnique = prisma.spatialPoint.findUnique;

      try {
        // 1. Ketua RT point returns rtLeader
        prisma.spatialPoint.findUnique = (async () =>
          sampleKetuaRtPoint) as unknown as typeof prisma.spatialPoint.findUnique;

        const req1 = { params: { id: 'point-rt-1' } } as unknown as Request;
        const res1 = fakeRes();

        await getPoint(req1, res1 as unknown as Response);

        assert.equal(res1.status, 200);
        const body1 = res1.body as {
          point: { id: string; name: string; rtLeader: { name: string } | null };
        };
        assert.equal(body1.point.id, 'point-rt-1');
        assert.equal(body1.point.name, 'Pos RT 01');
        assert.equal(body1.point.rtLeader?.name, 'Bambang Supriyanto');

        // 2. Bank Sampah point returns rtLeader: null
        prisma.spatialPoint.findUnique = (async () =>
          sampleBankSampahPoint) as unknown as typeof prisma.spatialPoint.findUnique;

        const req2 = { params: { id: 'point-bs-1' } } as unknown as Request;
        const res2 = fakeRes();

        await getPoint(req2, res2 as unknown as Response);

        assert.equal(res2.status, 200);
        const body2 = res2.body as {
          point: { id: string; name: string; rtLeader: unknown };
        };
        assert.equal(body2.point.id, 'point-bs-1');
        assert.equal(body2.point.rtLeader, null);
      } finally {
        prisma.spatialPoint.findUnique = originalFindUnique;
      }
    });

    it('returns 404 when point is not found', async () => {
      const originalFindUnique = prisma.spatialPoint.findUnique;
      prisma.spatialPoint.findUnique = (async () =>
        null) as unknown as typeof prisma.spatialPoint.findUnique;

      try {
        const req = { params: { id: 'non-existent' } } as unknown as Request;
        const res = fakeRes();

        await getPoint(req, res as unknown as Response);

        assert.equal(res.status, 404);
        assert.deepEqual(res.body, { error: 'Titik spasial tidak ditemukan' });
      } finally {
        prisma.spatialPoint.findUnique = originalFindUnique;
      }
    });
  });

  describe('listRtLeaders', () => {
    it('resolves coordinates strictly from spatial_points with type=ketua_rt', async () => {
      const originalCount = prisma.rtLeader.count;
      const originalFindMany = prisma.rtLeader.findMany;

      prisma.rtLeader.count = (async () => 2) as unknown as typeof prisma.rtLeader.count;
      prisma.rtLeader.findMany = (async () => [
        {
          rtNumber: 1,
          name: 'Bambang Supriyanto',
          phone: '081234567801',
          phoneIsWhatsapp: true,
          alamat: 'Jl. Mulawarman No. 12',
          createdAt: new Date(),
          updatedAt: new Date(),
          spatialPoints: [
            {
              point: {
                id: 'point-rt-1',
                type: 'ketua_rt',
                latitude: -1.2235,
                longitude: 116.9521,
              },
            },
            {
              // Bank sampah point also covering RT 1 should NOT be chosen as the leader's coordinates
              point: {
                id: 'point-bs-1',
                type: 'bank_sampah',
                latitude: -1.2299,
                longitude: 116.9599,
              },
            },
          ],
        },
        {
          rtNumber: 2,
          name: 'Hj. Siti Aminah',
          phone: '081234567802',
          phoneIsWhatsapp: true,
          alamat: 'Jl. Pemuda RT 02',
          createdAt: new Date(),
          updatedAt: new Date(),
          // Only covered by bank sampah, no ketua_rt point surveyed yet
          spatialPoints: [
            {
              point: {
                id: 'point-bs-1',
                type: 'bank_sampah',
                latitude: -1.2299,
                longitude: 116.9599,
              },
            },
          ],
        },
      ]) as unknown as typeof prisma.rtLeader.findMany;

      try {
        const req = { query: {} } as unknown as Request;
        const res = fakeRes();

        await listRtLeaders(req, res as unknown as Response);

        assert.equal(res.status, 200);
        const body = res.body as {
          leaders: Array<{
            rtNumber: number;
            coordinates: { latitude: number; longitude: number; pointId: string } | null;
          }>;
          total: number;
        };

        assert.equal(body.total, 2);
        // RT 1: Coordinate correctly picked from 'ketua_rt' point, not the bank sampah point
        assert.equal(body.leaders[0]?.coordinates?.pointId, 'point-rt-1');
        assert.equal(body.leaders[0]?.coordinates?.latitude, -1.2235);
        assert.equal(body.leaders[0]?.coordinates?.longitude, 116.9521);

        // RT 2: Since only bank_sampah point is linked, coordinates should resolve to null per SPEC.md §7
        assert.equal(body.leaders[1]?.coordinates, null);
      } finally {
        prisma.rtLeader.count = originalCount;
        prisma.rtLeader.findMany = originalFindMany;
      }
    });

    it('handles search and pagination parameters correctly', async () => {
      const originalCount = prisma.rtLeader.count;
      const originalFindMany = prisma.rtLeader.findMany;

      let capturedArgs: { take?: number; skip?: number; where?: unknown } | undefined;
      prisma.rtLeader.count = (async () => 1) as unknown as typeof prisma.rtLeader.count;
      prisma.rtLeader.findMany = (async (args: {
        take?: number;
        skip?: number;
        where?: unknown;
      }) => {
        capturedArgs = args;
        return [];
      }) as unknown as typeof prisma.rtLeader.findMany;

      try {
        const req = {
          query: { search: 'Bambang', limit: '10', page: '2' },
        } as unknown as Request;
        const res = fakeRes();

        await listRtLeaders(req, res as unknown as Response);

        assert.equal(res.status, 200);
        assert.equal(capturedArgs?.take, 10);
        assert.equal(capturedArgs?.skip, 10); // page 2 with limit 10 => skip 10
      } finally {
        prisma.rtLeader.count = originalCount;
        prisma.rtLeader.findMany = originalFindMany;
      }
    });

    it('defaults limit to 10 and computes skip when page is provided without limit', async () => {
      const originalCount = prisma.rtLeader.count;
      const originalFindMany = prisma.rtLeader.findMany;

      let capturedArgs: { take?: number; skip?: number; where?: unknown } | undefined;
      prisma.rtLeader.count = (async () => 1) as unknown as typeof prisma.rtLeader.count;
      prisma.rtLeader.findMany = (async (args: {
        take?: number;
        skip?: number;
        where?: unknown;
      }) => {
        capturedArgs = args;
        return [];
      }) as unknown as typeof prisma.rtLeader.findMany;

      try {
        const req = {
          query: { page: '2' },
        } as unknown as Request;
        const res = fakeRes();

        await listRtLeaders(req, res as unknown as Response);

        assert.equal(res.status, 200);
        assert.equal(capturedArgs?.take, 10);
        assert.equal(capturedArgs?.skip, 10); // page 2 with default limit 10 => skip 10
      } finally {
        prisma.rtLeader.count = originalCount;
        prisma.rtLeader.findMany = originalFindMany;
      }
    });

    it('defaults limit to 10 and sets skip to 0 when page: "1" is provided without limit', async () => {
      const originalCount = prisma.rtLeader.count;
      const originalFindMany = prisma.rtLeader.findMany;

      let capturedArgs: { take?: number; skip?: number; where?: unknown } | undefined;
      prisma.rtLeader.count = (async () => 1) as unknown as typeof prisma.rtLeader.count;
      prisma.rtLeader.findMany = (async (args: {
        take?: number;
        skip?: number;
        where?: unknown;
      }) => {
        capturedArgs = args;
        return [];
      }) as unknown as typeof prisma.rtLeader.findMany;

      try {
        const req = {
          query: { page: '1' },
        } as unknown as Request;
        const res = fakeRes();

        await listRtLeaders(req, res as unknown as Response);

        assert.equal(res.status, 200);
        assert.equal(capturedArgs?.take, 10);
        assert.equal(capturedArgs?.skip, 0); // page 1 with default limit 10 => skip 0
      } finally {
        prisma.rtLeader.count = originalCount;
        prisma.rtLeader.findMany = originalFindMany;
      }
    });

    it('leaves take and skip undefined when no pagination parameters are provided', async () => {
      const originalCount = prisma.rtLeader.count;
      const originalFindMany = prisma.rtLeader.findMany;

      let capturedArgs: { take?: number; skip?: number; where?: unknown } | undefined;
      prisma.rtLeader.count = (async () => 1) as unknown as typeof prisma.rtLeader.count;
      prisma.rtLeader.findMany = (async (args: {
        take?: number;
        skip?: number;
        where?: unknown;
      }) => {
        capturedArgs = args;
        return [];
      }) as unknown as typeof prisma.rtLeader.findMany;

      try {
        const req = {
          query: {},
        } as unknown as Request;
        const res = fakeRes();

        await listRtLeaders(req, res as unknown as Response);

        assert.equal(res.status, 200);
        assert.equal(capturedArgs?.take, undefined);
        assert.equal(capturedArgs?.skip, undefined);
      } finally {
        prisma.rtLeader.count = originalCount;
        prisma.rtLeader.findMany = originalFindMany;
      }
    });

    it('sets rtNumber filter when standalone numeric search is provided', async () => {
      const originalCount = prisma.rtLeader.count;
      const originalFindMany = prisma.rtLeader.findMany;

      let capturedWhere: Record<string, unknown> | undefined;
      prisma.rtLeader.count = (async () => 1) as unknown as typeof prisma.rtLeader.count;
      prisma.rtLeader.findMany = (async (args: { where?: Record<string, unknown> }) => {
        capturedWhere = args.where;
        return [];
      }) as unknown as typeof prisma.rtLeader.findMany;

      try {
        const req = {
          query: { search: '7' },
        } as unknown as Request;
        const res = fakeRes();

        await listRtLeaders(req, res as unknown as Response);

        assert.equal(res.status, 200);
        assert.equal(capturedWhere?.rtNumber, 7);
        assert.equal(capturedWhere?.OR, undefined);
      } finally {
        prisma.rtLeader.count = originalCount;
        prisma.rtLeader.findMany = originalFindMany;
      }
    });

    it('preserves explicit rt filter when numeric search is also provided', async () => {
      const originalCount = prisma.rtLeader.count;
      const originalFindMany = prisma.rtLeader.findMany;

      let capturedWhere: Record<string, unknown> | undefined;
      prisma.rtLeader.count = (async () => 1) as unknown as typeof prisma.rtLeader.count;
      prisma.rtLeader.findMany = (async (args: { where?: Record<string, unknown> }) => {
        capturedWhere = args.where;
        return [];
      }) as unknown as typeof prisma.rtLeader.findMany;

      try {
        const req = {
          query: { rt: '3', search: '7' },
        } as unknown as Request;
        const res = fakeRes();

        await listRtLeaders(req, res as unknown as Response);

        assert.equal(res.status, 200);
        assert.equal(capturedWhere?.rtNumber, 3);
        assert.deepEqual(capturedWhere?.OR, [
          { name: { contains: '7' } },
          { alamat: { contains: '7' } },
        ]);
      } finally {
        prisma.rtLeader.count = originalCount;
        prisma.rtLeader.findMany = originalFindMany;
      }
    });
  });

  describe('getRtLeader', () => {
    it('returns a single RT leader with joined coordinates', async () => {
      const originalFindUnique = prisma.rtLeader.findUnique;
      prisma.rtLeader.findUnique = (async () => ({
        rtNumber: 1,
        name: 'Bambang Supriyanto',
        phone: '081234567801',
        phoneIsWhatsapp: true,
        alamat: 'Jl. Mulawarman No. 12',
        createdAt: new Date(),
        updatedAt: new Date(),
        spatialPoints: [
          {
            point: {
              id: 'point-rt-1',
              type: 'ketua_rt',
              latitude: -1.2235,
              longitude: 116.9521,
            },
          },
        ],
      })) as unknown as typeof prisma.rtLeader.findUnique;

      try {
        const req = { params: { rtNumber: '1' } } as unknown as Request;
        const res = fakeRes();

        await getRtLeader(req, res as unknown as Response);

        assert.equal(res.status, 200);
        const body = res.body as {
          leader: {
            rtNumber: number;
            name: string;
            coordinates: { latitude: number; longitude: number } | null;
          };
        };
        assert.equal(body.leader.rtNumber, 1);
        assert.equal(body.leader.name, 'Bambang Supriyanto');
        assert.equal(body.leader.coordinates?.latitude, -1.2235);
      } finally {
        prisma.rtLeader.findUnique = originalFindUnique;
      }
    });

    it('rejects invalid RT number with 400 and returns 404 for non-existent RT', async () => {
      const res1 = fakeRes();
      await getRtLeader(
        { params: { rtNumber: 'abc' } } as unknown as Request,
        res1 as unknown as Response,
      );
      assert.equal(res1.status, 400);

      const originalFindUnique = prisma.rtLeader.findUnique;
      prisma.rtLeader.findUnique = (async () =>
        null) as unknown as typeof prisma.rtLeader.findUnique;

      try {
        const res2 = fakeRes();
        await getRtLeader(
          { params: { rtNumber: '999' } } as unknown as Request,
          res2 as unknown as Response,
        );
        assert.equal(res2.status, 404);
        assert.deepEqual(res2.body, { error: 'Ketua RT tidak ditemukan' });
      } finally {
        prisma.rtLeader.findUnique = originalFindUnique;
      }
    });
  });

  describe('getSummary', () => {
    it('returns aggregation counts for points and RT leaders', async () => {
      const originalPointCount = prisma.spatialPoint.count;
      const originalGroupBy = prisma.spatialPoint.groupBy;
      const originalLeaderCount = prisma.rtLeader.count;

      prisma.spatialPoint.count = (async () => 5) as unknown as typeof prisma.spatialPoint.count;
      prisma.spatialPoint.groupBy = (async () => [
        { type: 'ketua_rt', _count: { _all: 3 } },
        { type: 'bank_sampah', _count: { _all: 2 } },
      ]) as unknown as typeof prisma.spatialPoint.groupBy;
      prisma.rtLeader.count = (async (args?: { where?: unknown }) => {
        if (args?.where) {
          return 4; // rtLeadersWithCoordinates
        }
        return 10; // totalRtLeaders
      }) as unknown as typeof prisma.rtLeader.count;

      try {
        const req = {} as unknown as Request;
        const res = fakeRes();

        await getSummary(req, res as unknown as Response);

        assert.equal(res.status, 200);
        const body = res.body as {
          totalPoints: number;
          pointsByType: Record<string, number>;
          totalRtLeaders: number;
          rtLeadersWithCoordinates: number;
          rtLeadersWithoutCoordinates: number;
        };

        assert.equal(body.totalPoints, 5);
        assert.equal(body.pointsByType.ketua_rt, 3);
        assert.equal(body.pointsByType.bank_sampah, 2);
        assert.equal(body.totalRtLeaders, 10);
        assert.equal(body.rtLeadersWithCoordinates, 4);
        assert.equal(body.rtLeadersWithoutCoordinates, 6);
      } finally {
        prisma.spatialPoint.count = originalPointCount;
        prisma.spatialPoint.groupBy = originalGroupBy;
        prisma.rtLeader.count = originalLeaderCount;
      }
    });
  });
});
