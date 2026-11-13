import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { STAGES, TILE_LEGEND } from '../src/data/stages.js';
import { INGREDIENTS } from '../src/data/ingredients.js';
import { parseStage } from '../src/sim/world.js';

describe('ステージ定義と parseStage の検証', () => {
  it('kado の grid の全行の長さが等しい（13）', () => {
    const { grid } = STAGES.kado;
    assert.ok(Array.isArray(grid) && grid.length > 0, 'grid は空でない配列である必要があります');

    for (const [y, row] of grid.entries()) {
      assert.equal(row.length, 13, `kado の ${y} 行目の長さが 13 ではありません (実際: ${row.length})`);
    }
  });

  for (const [stageId, stage] of Object.entries(STAGES)) {
    describe(`ステージ: ${stageId}`, () => {
      it('初期位置（数字 1〜4）がちょうど4つあり、parseStage の spawns が4つとも定義される', () => {
        const counts = new Map([
          ['1', 0],
          ['2', 0],
          ['3', 0],
          ['4', 0],
        ]);

        for (const row of stage.grid) {
          for (const ch of row) {
            if (counts.has(ch)) {
              counts.set(ch, counts.get(ch) + 1);
            }
          }
        }

        let total = 0;
        for (const [num, count] of counts.entries()) {
          assert.equal(count, 1, `初期位置 '${num}' はちょうど1つ必要です (実際: ${count})`);
          total += count;
        }
        assert.equal(total, 4, '初期位置は合計4つ必要です');

        const { spawns } = parseStage(stage);
        assert.equal(spawns.length, 4, 'spawns は長さ 4 の配列である必要があります');
        for (const [index, spawn] of spawns.entries()) {
          assert.ok(spawn !== undefined && spawn !== null, `spawns[${index}] が未定義です`);
          assert.equal(typeof spawn.x, 'number', `spawns[${index}].x は数値である必要があります`);
          assert.equal(typeof spawn.y, 'number', `spawns[${index}].y は数値である必要があります`);
        }
      });

      it('grid に現れる文字はすべて TILE_LEGEND のキーか stage.legend のキーである', () => {
        const stageLegend = stage.legend ?? {};

        for (const [y, row] of stage.grid.entries()) {
          for (const [x, ch] of [...row].entries()) {
            const known = Object.hasOwn(TILE_LEGEND, ch) || Object.hasOwn(stageLegend, ch);
            assert.ok(known, `(${x}, ${y}) の文字 '${ch}' が TILE_LEGEND にも stage.legend にも定義されていません`);
          }
        }
      });

      it('legend の値 "box:<食材>" の食材が INGREDIENTS に存在する', () => {
        const stageLegend = stage.legend ?? {};

        for (const [key, value] of Object.entries(stageLegend)) {
          if (typeof value === 'string' && value.startsWith('box:')) {
            const ingredient = value.slice('box:'.length);
            assert.ok(
              Object.hasOwn(INGREDIENTS, ingredient),
              `legend['${key}'] = '${value}' の食材 '${ingredient}' が INGREDIENTS に存在しません`
            );
          }
        }
      });

      it('触れる設備（floor 以外のタイル）は、8方向のどこかが floor タイルに隣接している', () => {
        const { tiles, width, height } = parseStage(stage);
        const dirs = [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ];

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const tile = tiles[y][x];
            if (tile.type === 'floor') continue;

            const hasAdjacentFloor = dirs.some(([dx, dy]) => {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
              return tiles[ny][nx].type === 'floor';
            });

            assert.ok(
              hasAdjacentFloor,
              `(${x}, ${y}) の設備 '${tile.type}' がどの floor タイルにも隣接していません`
            );
          }
        }
      });

      it('parseStage の width/height が grid と一致する', () => {
        const { width, height } = parseStage(stage);
        assert.equal(height, stage.grid.length, 'height が grid の行数と一致しません');
        assert.equal(width, stage.grid[0].length, 'width が grid の列数と一致しません');
      });
    });
  }
});
