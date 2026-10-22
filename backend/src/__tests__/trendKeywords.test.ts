import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TREND_KEYWORDS, findTrendKeywords, trendWarningAckKey } from '../utils/trendKeywords.js';

/**
 * Deliberately spelled out here (not derived from TREND_KEYWORDS): removing a word from the
 * list that polices admin-authored templates must be a conscious change that touches this
 * test. Additions are free — the assertion below is a superset check.
 */
const REQUIRED_KEYWORDS = [
  // direction verbs
  'naik',
  'turun',
  'meningkat',
  'menurun',
  'bertambah',
  'berkurang',
  'melonjak',
  'merosot',
  'anjlok',
  'menyusut',
  'membaik',
  'memburuk',
  // nouns
  'kenaikan',
  'penurunan',
  'peningkatan',
  'pertambahan',
  'pengurangan',
  'lonjakan',
  // superlatives
  'tertinggi',
  'terendah',
  'terbanyak',
  'tersedikit',
  'terbesar',
  'terkecil',
  'terpadat',
  'paling',
  // comparison / continuity
  'lebih tinggi',
  'lebih rendah',
  'lebih banyak',
  'lebih sedikit',
  'lebih besar',
  'lebih kecil',
  'semakin',
  'kian',
  'makin',
  'terus',
  'stabil',
];

describe('utils/trendKeywords', () => {
  describe('TREND_KEYWORDS', () => {
    it('contains every required keyword (SPEC §5 names meningkat, menurun, tertinggi, terendah)', () => {
      for (const keyword of REQUIRED_KEYWORDS) {
        assert.ok(TREND_KEYWORDS.includes(keyword), `missing keyword: ${keyword}`);
      }
    });

    it('is lowercase, trimmed, single-spaced and free of duplicates', () => {
      for (const keyword of TREND_KEYWORDS) {
        assert.equal(keyword, keyword.toLowerCase(), keyword);
        assert.equal(keyword, keyword.trim(), keyword);
        assert.doesNotMatch(keyword, /\s{2,}/, keyword);
        assert.notEqual(keyword, '');
      }
      assert.equal(new Set(TREND_KEYWORDS).size, TREND_KEYWORDS.length);
    });

    it('deliberately excludes "tetap" (it would flag "penduduk tetap")', () => {
      assert.equal(TREND_KEYWORDS.includes('tetap'), false);
    });
  });

  describe('findTrendKeywords', () => {
    describe('detects every keyword in the list', () => {
      for (const keyword of TREND_KEYWORDS) {
        it(`flags "${keyword}"`, () => {
          const text = `Jumlah penduduk ${keyword} tahun ini.`;
          const matches = findTrendKeywords(text);

          assert.equal(matches.length, 1);
          const match = matches[0]!;
          assert.equal(match.keyword, keyword);
          assert.equal(match.phrase, keyword);
          assert.equal(text.slice(match.start, match.end), match.phrase);
          assert.equal(match.start, 'Jumlah penduduk '.length);
        });
      }
    });

    it('matches case-insensitively, keeping the written casing in phrase and lowercase in keyword', () => {
      const [upper] = findTrendKeywords('Penduduk MENINGKAT.');
      const [title] = findTrendKeywords('Penduduk Meningkat.');

      assert.equal(upper!.phrase, 'MENINGKAT');
      assert.equal(upper!.keyword, 'meningkat');
      assert.equal(title!.phrase, 'Meningkat');
      assert.equal(title!.keyword, 'meningkat');
    });

    it('includes a trailing -nya in the phrase', () => {
      const text = 'Meningkatnya jumlah penduduk dan kenaikannya cukup besar.';
      const matches = findTrendKeywords(text);

      assert.deepEqual(
        matches.map((m) => [m.phrase, m.keyword]),
        [
          ['Meningkatnya', 'meningkat'],
          ['kenaikannya', 'kenaikan'],
        ],
      );
      for (const m of matches) assert.equal(text.slice(m.start, m.end), m.phrase);
    });

    it('does not match a keyword embedded in a longer word', () => {
      for (const word of [
        'menaiki', // me-naik-i
        'turunan',
        'keturunan',
        'terusan',
        'terusik',
        'berpaling',
        'stabilitas',
        'stabilisasi',
        'semakinan',
      ]) {
        assert.deepEqual(findTrendKeywords(`Ini ${word} saja.`), [], word);
      }
    });

    it('does not match when a digit touches the keyword', () => {
      assert.deepEqual(findTrendKeywords('2naik'), []);
      assert.deepEqual(findTrendKeywords('naik2'), []);
      assert.deepEqual(findTrendKeywords('a1turun'), []);
    });

    it('treats punctuation and brackets as word boundaries', () => {
      assert.equal(findTrendKeywords('Data meningkat, lalu')[0]?.phrase, 'meningkat');
      assert.equal(findTrendKeywords('Data (menurun) lalu')[0]?.phrase, 'menurun');
      assert.equal(findTrendKeywords('Data terendah.')[0]?.phrase, 'terendah');
      assert.equal(findTrendKeywords('"naik"')[0]?.phrase, 'naik');
      assert.equal(findTrendKeywords('naik/turun').length, 2);
    });

    it('matches multi-word phrases across any whitespace and reports them as one match', () => {
      const text = 'Angkanya lebih\n  tinggi dari rata-rata.';
      const matches = findTrendKeywords(text);

      assert.equal(matches.length, 1);
      assert.equal(matches[0]!.keyword, 'lebih tinggi');
      assert.equal(matches[0]!.phrase, 'lebih\n  tinggi');
      assert.equal(text.slice(matches[0]!.start, matches[0]!.end), 'lebih\n  tinggi');
    });

    it('does not flag the halves of a multi-word phrase on their own', () => {
      assert.deepEqual(findTrendKeywords('lebih dari separuh'), []);
      assert.deepEqual(findTrendKeywords('Kelurahan tinggi'), []);
      assert.deepEqual(findTrendKeywords('lebih'), []);
      assert.deepEqual(findTrendKeywords('tinggi'), []);
    });

    it('reports one match for "paling tinggi" and one for "lebih banyak"', () => {
      assert.deepEqual(
        findTrendKeywords('paling tinggi').map((m) => m.phrase),
        ['paling'],
      );
      assert.deepEqual(
        findTrendKeywords('lebih banyak').map((m) => m.phrase),
        ['lebih banyak'],
      );
    });

    it('ignores anything inside {placeholders}', () => {
      assert.deepEqual(findTrendKeywords('{trend} {delta}'), []);
      assert.deepEqual(findTrendKeywords('{naik}'), []);
      assert.deepEqual(findTrendKeywords('Total {label} dan {value_current}'), []);
    });

    it('keeps offsets correct for text after a placeholder', () => {
      const text = '{label}meningkat';
      const [match] = findTrendKeywords(text);

      assert.equal(match!.start, 7);
      assert.equal(match!.end, 16);
      assert.equal(text.slice(match!.start, match!.end), 'meningkat');
    });

    it('finds every occurrence of a repeated keyword in ascending order', () => {
      const text = 'naik dan naik lagi, lalu naik';
      const matches = findTrendKeywords(text);

      assert.deepEqual(
        matches.map((m) => m.start),
        [0, 9, 25],
      );
      for (const m of matches) assert.equal(text.slice(m.start, m.end), 'naik');
    });

    it('returns different keywords sorted by position', () => {
      const text = 'Terendah di RT 3, tertinggi di RT 9, dan terus menurun.';

      assert.deepEqual(
        findTrendKeywords(text).map((m) => m.keyword),
        ['terendah', 'tertinggi', 'terus', 'menurun'],
      );
    });

    it('does not flag neutral wording', () => {
      assert.deepEqual(
        findTrendKeywords(
          'Penduduk tetap tercatat 100 jiwa dibandingkan tahun lalu, terdapat 3 RT.',
        ),
        [],
      );
      assert.deepEqual(findTrendKeywords('Berdasarkan data 2025, jumlah penduduk tercatat'), []);
    });

    it('returns an empty array for empty or whitespace-only input', () => {
      assert.deepEqual(findTrendKeywords(''), []);
      assert.deepEqual(findTrendKeywords('   \n\t '), []);
    });

    it('is stateless across calls (no leaked regex lastIndex)', () => {
      const text = 'naik, turun, meningkat, menurun, terendah';
      const first = findTrendKeywords(text);
      const second = findTrendKeywords(text);
      const third = findTrendKeywords('naik');

      assert.equal(first.length, 5);
      assert.deepEqual(second, first);
      assert.equal(third.length, 1);
    });

    describe('excerpt', () => {
      it('is the whole text when there is less than 30 characters of context on each side', () => {
        const text = 'Penduduk meningkat pesat.';

        assert.equal(findTrendKeywords(text)[0]!.excerpt, text);
      });

      it('adds an ellipsis on both sides when context is truncated on both', () => {
        const text = `${'a'.repeat(50)} meningkat ${'b'.repeat(50)}`;

        assert.equal(
          findTrendKeywords(text)[0]!.excerpt,
          `…${'a'.repeat(29)} meningkat ${'b'.repeat(29)}…`,
        );
      });

      it('adds an ellipsis only on the truncated side', () => {
        const rightOnly = `meningkat ${'b'.repeat(50)}`;
        const leftOnly = `${'a'.repeat(50)} meningkat`;

        assert.equal(findTrendKeywords(rightOnly)[0]!.excerpt, `meningkat ${'b'.repeat(29)}…`);
        assert.equal(findTrendKeywords(leftOnly)[0]!.excerpt, `…${'a'.repeat(29)} meningkat`);
      });

      it('has no ellipsis when the context is exactly 30 characters', () => {
        const text = `meningkat ${'b'.repeat(29)}`;

        assert.equal(findTrendKeywords(text)[0]!.excerpt, text);
      });

      it('always contains the phrase', () => {
        const text = `${'x '.repeat(40)}Tertinggi${' y'.repeat(40)}`;

        assert.ok(findTrendKeywords(text)[0]!.excerpt.includes('Tertinggi'));
      });
    });
  });

  describe('trendWarningAckKey', () => {
    const body = 'Jumlah penduduk meningkat, bahkan tertinggi di Balikpapan.';
    const [first, second] = findTrendKeywords(body);

    it('finds the two matches this suite relies on', () => {
      assert.equal(first!.phrase, 'meningkat');
      assert.equal(second!.phrase, 'tertinggi');
    });

    it('is a 64-character lowercase hex digest', () => {
      assert.match(trendWarningAckKey(body, first!), /^[0-9a-f]{64}$/);
    });

    it('is deterministic', () => {
      assert.equal(trendWarningAckKey(body, first!), trendWarningAckKey(body, first!));
      assert.equal(trendWarningAckKey(body, first!), trendWarningAckKey(body, { ...first! }));
    });

    it('differs between two different flagged phrases in the same body', () => {
      assert.notEqual(trendWarningAckKey(body, first!), trendWarningAckKey(body, second!));
    });

    it('differs when any character of the body changes, even outside the phrase', () => {
      const edited = body.replace('Balikpapan', 'Balikpapax');
      const [editedFirst] = findTrendKeywords(edited);

      assert.equal(editedFirst!.start, first!.start);
      assert.equal(editedFirst!.phrase, first!.phrase);
      assert.notEqual(trendWarningAckKey(edited, editedFirst!), trendWarningAckKey(body, first!));
    });

    it('differs for two occurrences of the same keyword', () => {
      const text = 'naik dan naik';
      const [a, b] = findTrendKeywords(text);

      assert.equal(a!.phrase, b!.phrase);
      assert.notEqual(trendWarningAckKey(text, a!), trendWarningAckKey(text, b!));
    });

    it('differs when only the position differs', () => {
      assert.notEqual(
        trendWarningAckKey(body, { phrase: 'meningkat', start: 16 }),
        trendWarningAckKey(body, { phrase: 'meningkat', start: 17 }),
      );
    });

    it('differs when only the written casing of the phrase differs', () => {
      assert.notEqual(
        trendWarningAckKey(body, { phrase: 'meningkat', start: 16 }),
        trendWarningAckKey(body, { phrase: 'Meningkat', start: 16 }),
      );
    });

    it('does not collide when body/start/phrase boundaries are shifted', () => {
      // Each pair concatenates to the same string if the fields are joined without
      // separators ("ab" + 1 + "2c" === "ab1" + 2 + "c"), so these only pass for a key that
      // delimits its parts.
      assert.notEqual(
        trendWarningAckKey('ab', { phrase: '2c', start: 1 }),
        trendWarningAckKey('ab1', { phrase: 'c', start: 2 }),
      );
      assert.notEqual(
        trendWarningAckKey('x', { phrase: '1y', start: 2 }),
        trendWarningAckKey('x', { phrase: 'y', start: 21 }),
      );
    });
  });
});
