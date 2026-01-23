import { Column, DataTable, TypedArray } from './data-table';

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
const mergeCombine = (dataTables: DataTable[]) : DataTable => {
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

    const bucketSize = 1;
    type BucketIndex = {x: number, y: number, z: number};

    // tableBuckets holds one map per table that counts the splats per bucket
    const tableBuckets: Map<BucketIndex, number>[] =
        dataTables.map((table) => {
            const buckets = new Map<BucketIndex, number>();
            let row;
            let bIdx;
            let current;
            for (let r = 0; r < table.numRows; r++) {
                row = table.getRow(r);
                bIdx = {
                    x: Math.floor(row.x / bucketSize),
                    y: Math.floor(row.y / bucketSize),
                    z: Math.floor(row.z / bucketSize)
                };
                current = buckets.get(bIdx) ?? 0;
                buckets.set(bIdx, current + 1);
            }
            return buckets;
        });

    // bucketTables holds the table-index of the table with the most splats in this bucket
    const bucketTables: Map<BucketIndex, number> =
        tableBuckets.reduce((prev, current) => {
            Array.from(current.entries()).forEach(([bIdx, count]) => {
                if (count > (prev.get(bIdx) ?? 0)) prev.set(bIdx, count);
            });
            return prev;
        }, new Map<BucketIndex, number>());

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
            bIdx = {
                x: Math.floor(row.x / bucketSize),
                y: Math.floor(row.y / bucketSize),
                z: Math.floor(row.z / bucketSize)
            };
            if (bucketTables.get(bIdx) === i) {
                result.setRow(rowIndex++, row);
            }
        }

    }

    return result;
};

export { mergeCombine };
