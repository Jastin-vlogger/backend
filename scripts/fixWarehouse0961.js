require('dotenv').config();
const mongoose = require('mongoose');
const Container = require('../src/models/container.model');

const APPLY = process.argv.includes('--apply');

// Manual warehouse correction for RHST-0007/PO01-0961 children -1, -2, -4
// (user-provided container serial list, verified against real data 2026-08-06).
// Only actual.transportationBooked[].warehouse is touched.
const CHANGES = [
  {
    containerId: '6a1e63fa40b1d6ef195ea9a9', // 0961-1
    from: 'SAJAH - SAJAH',
    to: 'AL AIN - AL AIN',
    serials: ['DPWU2056090', 'DPWU2058805', 'LYGU3197452', 'LYGU3198037', 'TIIU2302180', 'TIIU2438834'],
  },
  {
    containerId: '6a1e63fa40b1d6ef195ea9aa', // 0961-2 (LEGU serials mislabeled as 0961-4 by requester, confirmed)
    from: 'SAJAH - SAJAH',
    to: 'AL AIN - AL AIN',
    serials: ['LEGU2015928', 'LEGU2016288', 'LEGU2018228'],
  },
  {
    containerId: '6a1e63fa40b1d6ef195ea9ac', // 0961-4
    from: 'AL AIN - AL AIN',
    to: 'SAJAH - SAJAH',
    serials: ['DPWU2033860', 'DPWU2022778', 'DPWU2020482', 'DPWU2024066', 'DPWU2130155'],
  },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (${APPLY ? 'APPLY' : 'DRY RUN — pass --apply to write'})`);

  for (const change of CHANGES) {
    const container = await Container.findById(change.containerId);
    if (!container) { console.log(`Container ${change.containerId} not found`); continue; }
    const booked = container.actual?.transportationBooked || [];
    let touched = 0;
    change.serials.forEach((serial) => {
      const row = booked.find((r) => r.containerSerialNo === serial);
      if (!row) { console.log(`  MISSING serial ${serial} in ${change.containerId}`); return; }
      if (row.warehouse !== change.from) {
        console.log(`  SKIP ${serial}: current warehouse "${row.warehouse}" != expected "${change.from}"`);
        return;
      }
      console.log(`  ${change.containerId} ${serial}: "${row.warehouse}" -> "${change.to}"`);
      row.warehouse = change.to;
      touched++;
    });
    if (touched && APPLY) {
      container.markModified('actual.transportationBooked');
      await container.save();
    }
    console.log(`  -> ${touched}/${change.serials.length} ${APPLY ? 'updated' : 'would update'} for ${change.containerId}\n`);
  }

  await mongoose.disconnect();
}

run().catch((err) => { console.error('Script failed:', err); process.exit(1); });
