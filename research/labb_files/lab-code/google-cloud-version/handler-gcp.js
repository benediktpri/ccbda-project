const { Firestore } = require('@google-cloud/firestore');
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const firestore = new Firestore();
const collectionName = "ResearchData";

module.exports.hello = async (req, res) => {
    const method = req.method;

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (method === 'OPTIONS') {
        return res.status(204).send('');
    }

    try {
        if (method === 'GET' && !req.headers['accept']?.includes('application/json')) {
            const htmlPath = path.join(__dirname, 'index.html');
            const htmlContent = fs.readFileSync(htmlPath, 'utf8');
            return res.status(200).type('text/html').send(htmlContent);
        }

        if (method === 'POST') {
            const data = req.body || {};
            const id = crypto.randomUUID();
            const item = {
                id: id,
                text: data.text || "No message",
                timestamp: new Date().toLocaleString('sv-SE')
            };

            await firestore.collection(collectionName).doc(id).set(item);

            return res.status(200).send({ success: true, item });
        }

        const snapshot = await firestore.collection(collectionName).get();
        const items = [];
        snapshot.forEach(doc => items.push(doc.data()));

        return res.status(200).send(items);

    } catch (err) {
        console.error(err);
        return res.status(500).send({ error: err.message });
    }
};