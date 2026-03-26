const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function checkPhones() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const User = mongoose.connection.collection('users');

        // Get sample of phone number formats
        const samples = await User.aggregate([
            { $match: { role: 'client', phone: { $exists: true, $ne: null, $ne: '' } } },
            { $project: { clientId: 1, phone: 1, firstName: 1 } },
            { $limit: 30 }
        ]).toArray();

        console.log('📱 Sample phone number formats in database:');
        console.log('═'.repeat(60));
        samples.forEach(s => {
            const phone = s.phone;
            const type = typeof phone;
            const len = phone?.toString().length || 0;
            console.log(`  ${s.clientId} | ${s.firstName}: "${phone}" (type: ${type}, len: ${len})`);
        });

        // Check for phones with spaces
        const withSpaces = await User.countDocuments({ role: 'client', phone: { $regex: / / } });
        console.log(`\n📊 Phones with spaces: ${withSpaces}`);

        // Check for phones without + prefix
        const withoutPlus = await User.countDocuments({
            role: 'client',
            phone: { $exists: true, $ne: null, $ne: '', $not: /^\+/ }
        });
        console.log(`📊 Phones without + prefix: ${withoutPlus}`);

        // Check for phones stored as numbers (not strings)
        const phoneTypes = await User.aggregate([
            { $match: { role: 'client' } },
            { $project: { phoneType: { $type: '$phone' } } },
            { $group: { _id: '$phoneType', count: { $sum: 1 } } }
        ]).toArray();
        console.log(`\n📊 Phone field types:`, phoneTypes);

        // Check for phone numbers with leading zeros that might be stripped
        const phonePatterns = await User.aggregate([
            { $match: { role: 'client', phone: { $exists: true, $ne: null } } },
            {
                $project: {
                    phone: 1,
                    firstChar: { $substr: ['$phone', 0, 1] },
                    startsWithPlus: { $eq: [{ $substr: ['$phone', 0, 1] }, '+'] },
                    length: { $strLenCP: '$phone' }
                }
            },
            {
                $group: {
                    _id: { firstChar: '$firstChar', startsWithPlus: '$startsWithPlus' },
                    count: { $sum: 1 },
                    avgLen: { $avg: '$length' },
                    sample: { $first: '$phone' }
                }
            },
            { $sort: { count: -1 } }
        ]).toArray();

        console.log('\n📊 Phone number patterns:');
        phonePatterns.forEach(p => {
            console.log(`  Starts with "${p._id.firstChar}": ${p.count} phones (avg len: ${p.avgLen?.toFixed(1)}) - sample: "${p.sample}"`);
        });

        // Check for specific problematic patterns
        console.log('\n🔍 Checking for problematic patterns...');

        // Numbers stored as integers (would lose leading zeros)
        const numericPhones = await User.find({
            role: 'client',
            $expr: { $eq: [{ $type: '$phone' }, 'double'] }
        }).select('clientId phone firstName').limit(10).lean();

        if (numericPhones.length > 0) {
            console.log(`\n⚠️  Phones stored as NUMBERS (not strings):`);
            numericPhones.forEach(u => console.log(`  ${u.clientId}: ${u.phone} (${u.firstName})`));
        }

        // Short phone numbers (less than 10 digits)
        const shortPhones = await User.find({
            role: 'client',
            phone: { $exists: true, $ne: null },
            $expr: { $lt: [{ $strLenCP: { $replaceAll: { input: '$phone', find: /\D/.source, replacement: '' } } }, 10] }
        }).select('clientId phone firstName').limit(10).lean();

        // Check phones by length
        const phoneLengths = await User.aggregate([
            { $match: { role: 'client', phone: { $exists: true, $ne: null, $ne: '' } } },
            {
                $project: {
                    phone: 1,
                    length: { $strLenCP: '$phone' }
                }
            },
            {
                $group: {
                    _id: '$length',
                    count: { $sum: 1 },
                    sample: { $first: '$phone' }
                }
            },
            { $sort: { _id: 1 } }
        ]).toArray();

        console.log('\n📊 Phone lengths distribution:');
        phoneLengths.forEach(p => {
            console.log(`  Length ${p._id}: ${p.count} phones - sample: "${p.sample}"`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Done');

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkPhones();
