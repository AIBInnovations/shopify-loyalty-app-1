const mongoose = require('mongoose');

// MongoDB connection with better error handling
const connectDatabase = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.warn('[DATABASE] MongoDB URI not configured - running without database');
      return false;
    }

    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      bufferMaxEntries: 0, // Disable mongoose buffering
      bufferCommands: false, // Disable mongoose buffering
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    
    console.log('✅ [DATABASE] MongoDB connected successfully');
    console.log(`📊 [DATABASE] Connected to: ${mongoose.connection.name}`);
    
    return true;
  } catch (error) {
    console.error('❌ [DATABASE] MongoDB connection failed:', error.message);
    return false;
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('🔗 [DATABASE] Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ [DATABASE] Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ [DATABASE] Mongoose disconnected');
});

// Handle app termination
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('🔒 [DATABASE] MongoDB connection closed through app termination');
    process.exit(0);
  } catch (error) {
    console.error('❌ [DATABASE] Error closing MongoDB connection:', error);
    process.exit(1);
  }
});

// Test database connection
const testConnection = async () => {
  try {
    if (!mongoose.connection.readyState) {
      return { connected: false, error: 'No database connection' };
    }
    
    // Simple ping test
    await mongoose.connection.db.admin().ping();
    
    return {
      connected: true,
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      readyState: mongoose.connection.readyState
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
};

module.exports = {
  connectDatabase,
  testConnection
};