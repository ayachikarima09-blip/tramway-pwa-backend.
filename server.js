// ========================================
// SERVEUR NODE.JS + EXPRESS + MONGODB
// Fichier : backend/server.js
// Version Windows compatible
// ========================================

// Importer les bibliotheques necessaires
require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const bodyParser = require('body-parser');

// Creer l'application Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Connexion a MongoDB
let db;
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = 'tramway_db';
const COLLECTION_NAME = 'observations';

// Fonction pour se connecter a MongoDB
async function connectToMongoDB() {
    try {
        const client = await MongoClient.connect(MONGODB_URI);
        
        db = client.db(DATABASE_NAME);
        console.log('[OK] Connecte a MongoDB Atlas');
        console.log('[INFO] Base de donnees :', DATABASE_NAME);
        console.log('[INFO] Collection :', COLLECTION_NAME);
    } catch (error) {
        console.error('[ERREUR] Connexion MongoDB:', error.message);
        console.error('[ERREUR] Verifiez votre fichier .env');
        console.error('[ERREUR] Verifiez que votre IP est autorisee dans MongoDB Atlas');
        process.exit(1);
    }
}

// ========================================
// ROUTES DE L'API
// ========================================

// Route de test
app.get('/', (req, res) => {
    res.json({ 
        message: 'API Tramway - Serveur actif',
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

// Route pour verifier la connexion MongoDB
app.get('/api/health', async (req, res) => {
    try {
        await db.command({ ping: 1 });
        res.json({ 
            status: 'OK', 
            message: 'MongoDB connecte',
            database: DATABASE_NAME 
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR', 
            message: error.message 
        });
    }
});

// Route POST : Enregistrer une observation
app.post('/api/observations', async (req, res) => {
    try {
        const observation = req.body;
        
        if (!observation || !observation.id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Observation invalide : ID manquant' 
            });
        }
        
        console.log('[SYNC] Reception observation ID:', observation.id);
        
        observation.syncedAt = new Date().toISOString();
        observation.serverTimestamp = Date.now();
        
        const collection = db.collection(COLLECTION_NAME);
        const result = await collection.updateOne(
            { id: observation.id },
            { $set: observation },
            { upsert: true }
        );
        
        if (result.upsertedCount > 0) {
            console.log('[OK] Nouvelle observation creee:', observation.id);
        } else if (result.modifiedCount > 0) {
            console.log('[OK] Observation mise a jour:', observation.id);
        } else {
            console.log('[INFO] Observation deja a jour:', observation.id);
        }
        
        res.json({ 
            success: true, 
            message: 'Observation enregistree avec succes',
            id: observation.id,
            operation: result.upsertedCount > 0 ? 'created' : 'updated'
        });
        
    } catch (error) {
        console.error('[ERREUR] Enregistrement:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur',
            error: error.message 
        });
    }
});

// Route POST : Synchroniser plusieurs observations
app.post('/api/observations/batch', async (req, res) => {
    try {
        const observations = req.body.observations;
        
        if (!Array.isArray(observations) || observations.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Liste d\'observations invalide' 
            });
        }
        
        console.log('[SYNC] Reception de', observations.length, 'observations');
        
        const collection = db.collection(COLLECTION_NAME);
        const results = { success: 0, failed: 0, errors: [] };
        
        for (const obs of observations) {
            try {
                obs.syncedAt = new Date().toISOString();
                obs.serverTimestamp = Date.now();
                
                await collection.updateOne(
                    { id: obs.id },
                    { $set: obs },
                    { upsert: true }
                );
                
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ id: obs.id, error: error.message });
            }
        }
        
        console.log('[OK] Synchronisation terminee:', results.success, 'succes,', results.failed, 'echecs');
        
        res.json({
            success: true,
            message: 'Synchronisation par lot terminee',
            results
        });
        
    } catch (error) {
        console.error('[ERREUR] Synchronisation batch:', error.message);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Route GET : Recuperer toutes les observations
app.get('/api/observations', async (req, res) => {
    try {
        const collection = db.collection(COLLECTION_NAME);
        const observations = await collection.find({}).sort({ date: -1 }).toArray();
        
        res.json({
            success: true,
            count: observations.length,
            observations
        });
    } catch (error) {
        console.error('[ERREUR] Recuperation:', error.message);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Route GET : Recuperer une observation par ID
app.get('/api/observations/:id', async (req, res) => {
    try {
        const collection = db.collection(COLLECTION_NAME);
        const observation = await collection.findOne({ id: parseInt(req.params.id) });
        
        if (!observation) {
            return res.status(404).json({ 
                success: false, 
                message: 'Observation non trouvee' 
            });
        }
        
        res.json({
            success: true,
            observation
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Route DELETE : Supprimer une observation
app.delete('/api/observations/:id', async (req, res) => {
    try {
        const collection = db.collection(COLLECTION_NAME);
        const result = await collection.deleteOne({ id: parseInt(req.params.id) });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Observation non trouvee' 
            });
        }
        
        console.log('[DELETE] Observation supprimee:', req.params.id);
        
        res.json({
            success: true,
            message: 'Observation supprimee avec succes'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ========================================
// DEMARRAGE DU SERVEUR
// ========================================

async function startServer() {
    await connectToMongoDB();
    
    app.listen(PORT, () => {
        console.log('========================================');
        console.log('[OK] Serveur demarre sur http://localhost:' + PORT);
        console.log('[INFO] API disponible sur http://localhost:' + PORT + '/api');
        console.log('========================================');
        console.log('Routes disponibles :');
        console.log('  GET  /                           - Statut du serveur');
        console.log('  GET  /api/health                 - Sante de MongoDB');
        console.log('  GET  /api/observations           - Toutes les observations');
        console.log('  GET  /api/observations/:id       - Une observation');
        console.log('  POST /api/observations           - Creer/modifier une observation');
        console.log('  POST /api/observations/batch     - Sync multiple observations');
        console.log('  DELETE /api/observations/:id     - Supprimer une observation');
        console.log('========================================');
    });
}

process.on('unhandledRejection', (error) => {
    console.error('[ERREUR] Non geree:', error);
});

startServer();