import { Column, DataTable, Row, TypedArray } from './data-table';
import { computeSummary } from './summary';


class BucketIndexer {
    private bucketSize: number;
    private ranges = {
        x: {
            min: Number.MAX_VALUE,
            max: Number.MIN_VALUE
        },
        y: {
            min: Number.MAX_VALUE,
            max: Number.MIN_VALUE
        },
        z: {
            min: Number.MAX_VALUE,
            max: Number.MIN_VALUE
        }
    };

    private bucketCount = {
        x: 0,
        y: 0,
        z: 0
    };

    constructor(dataTables: DataTable[], bucketSize: number) {
        dataTables.forEach((table) => {
            const stats = computeSummary(table);
            this.ranges.x.min = Math.min(this.ranges.x.min, stats.columns.x.min);
            this.ranges.x.max = Math.min(this.ranges.x.max, stats.columns.x.max);
            this.ranges.y.min = Math.min(this.ranges.y.min, stats.columns.y.min);
            this.ranges.y.max = Math.min(this.ranges.y.max, stats.columns.y.max);
            this.ranges.z.min = Math.min(this.ranges.z.min, stats.columns.z.min);
            this.ranges.z.max = Math.min(this.ranges.z.max, stats.columns.z.max);
        });

        this.bucketSize = bucketSize;
        this.bucketCount.x = Math.ceil((this.ranges.x.max - this.ranges.x.min) / bucketSize);
        this.bucketCount.y = Math.ceil((this.ranges.y.max - this.ranges.y.min) / bucketSize);
        this.bucketCount.z = Math.ceil((this.ranges.z.max - this.ranges.z.min) / bucketSize);
    }

    findIndex(pos: Row): number {
        return Math.floor((pos.x - this.ranges.x.min) / this.bucketSize) +
            Math.floor((pos.y - this.ranges.y.min) / this.bucketSize) * this.bucketCount.x +
            Math.floor((pos.z - this.ranges.z.min) / this.bucketSize) * this.bucketCount.x * this.bucketCount.y;
    }
}

/**
 * Combines multiple DataTables into a single DataTable.
 *
 * Merges rows from all input tables. Columns are matched by name and type;
 * columns that don't exist in all tables will have undefined values for
 * rows from tables lacking that column.
 *
 * @param dataTables - Array of DataTables to combine.
 * @returns A new DataTable containing all rows from all input tables.
 *
 * @example
 * ```ts
 * const combined = combine([tableA, tableB, tableC]);
 * console.log(combined.numRows); // tableA.numRows + tableB.numRows + tableC.numRows
 * ```
 */
const xorCombine = (dataTables: DataTable[]) : DataTable => {
    if (dataTables.length === 1) {
        // nothing to combine
        return dataTables[0];
    }

    const findMatchingColumn = (columns: Column[], column: Column) => {
        for (let i = 0; i < columns.length; ++i) {
            if (columns[i].name === column.name &&
                columns[i].dataType === column.dataType) {
                return columns[i];
            }
        }
        return null;
    };

    // make unique list of columns where name and type much match
    const columns = dataTables[0].columns.slice();
    for (let i = 1; i < dataTables.length; ++i) {
        const dataTable = dataTables[i];
        for (let j = 0; j < dataTable.columns.length; ++j) {
            if (!findMatchingColumn(columns, dataTable.columns[j])) {
                columns.push(dataTable.columns[j]);
            }
        }
    }

    const indexer = new BucketIndexer(dataTables, 1);

    // tableBuckets holds one map per table that counts the splats per bucket
    const tableBuckets: Map<number, number>[] =
        dataTables.map((table) => {
            const buckets = new Map<number, number>();
            let bIdx;
            let current;
            for (let r = 0; r < table.numRows; r++) {
                bIdx = indexer.findIndex(table.getRow(r));
                current = buckets.get(bIdx) ?? 0;
                buckets.set(bIdx, current + 1);
            }
            return buckets;
        });

    // bucketTables holds the table-index of the table with the most splats in this bucket
    const bucketTables: Map<number, number> =
        tableBuckets.reduce((prev, current, tIdx) => {
            Array.from(current.entries()).forEach(([bIdx, count]) => {
                if (count > (prev.get(bIdx) ?? 0)) prev.set(bIdx, tIdx);
            });
            return prev;
        }, new Map<number, number>());

    // count total number of rows
    const totalRows = Array.from(bucketTables.entries()).reduce((prev, [bIdx, tIdx]) => prev + tableBuckets[tIdx].get(bIdx), 0);

    // construct output dataTable
    const resultColumns = columns.map((column) => {
        const constructor = column.data.constructor as new (length: number) => TypedArray;
        return new Column(column.name, new constructor(totalRows));
    });
    const result = new DataTable(resultColumns);

    // copy data
    let rowIndex = 0;
    let row;
    let bIdx;
    for (let i = 0; i < dataTables.length; i++) {
        const table = dataTables[i];

        for (let r = 0; r < table.numRows; r++) {
            row = table.getRow(r);
            bIdx = indexer.findIndex(row);
            if (bucketTables.get(bIdx) === i) {
                result.setRow(rowIndex++, row);
            }
        }

    }

    return result;
};

export { xorCombine };
