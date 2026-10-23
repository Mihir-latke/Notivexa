const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true, minlength: 6, select: false },
  role:        { type: String, enum: ['student','teacher','admin'], default: 'student' },
  institution: { type: String, default: '' },
  preferredLanguage: { type: String, default: 'English' },
  isActive:    { type: Boolean, default: true },
  studyStats:  {
    documentsUploaded: { type: Number, default: 0 },
    notesGenerated:    { type: Number, default: 0 },
    flashcardsCreated: { type: Number, default: 0 }
  }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function(p) {
  return bcrypt.compare(p, this.password);
};

userSchema.methods.toJSON = function() {
  const o = this.toObject();
  delete o.password;
  return o;
};

const sectionSchema = new mongoose.Schema({
  title:     { type: String, trim: true },
  content:   { type: String, default: '' },
  wordCount: { type: Number, default: 0 }
});

const documentSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:         { type: String, required: true, trim: true },
  originalName:  { type: String },
  fileType:      { type: String, enum: ['pdf','image','youtube','url','video'], default: 'pdf' },
  size:          { type: Number, default: 0 },
  filePath:      { type: String, required: true },
  status:        { type: String, enum: ['queued','processing','ready','partial','error'], default: 'processing', index: true },
  errorMessage:  { type: String, default: '' },
  extractedText: { type: String, default: '' },
  sections:      [sectionSchema],
  pageCount:     { type: Number, default: 0 },
  wordCount:     { type: Number, default: 0 },
  subject:       { type: String, default: 'General' },
  contentHash:      { type: String, index: true },
  extractionMethod: { type: String, enum: ['native','ocr','hybrid'], default: 'native' },
  ocrConfidence:    { type: Number, default: 100 },
  pageResults: [{
    pageNumber: { type: Number },
    text:       { type: String },
    method:     { type: String, enum: ['native','ocr'] },
    status:     { type: String, enum: ['queued','processing','ready','partial','success','warning','failed'] },
    confidence: { type: Number, default: 100 },
    wordCount:  { type: Number, default: 0 }
  }],
  outputs: [{
    type:      { type: String },
    language:  { type: String, default: 'English' },
    fileName:  { type: String },
    filePath:  { type: String },
    fileSize:  { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
  }],
  imagePaths: [{ type: String }],
  diagrams: [{
    page:     { type: Number, default: 1 },
    fileName: { type: String },
    base64:   { type: String }
  }]
}, { timestamps: true });

documentSchema.index({ user: 1, createdAt: -1 });
documentSchema.index({ user: 1, status: 1 });

const flashcardSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  documentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  documentTitle: { type: String, default: '' },
  title:         { type: String, required: true },
  subject:       { type: String, default: 'General' },
  language:      { type: String, default: 'English' },
  cards: [{
    question:   { type: String, required: true },
    answer:     { type: String, required: true },
    difficulty: { type: String, enum: ['easy','medium','hard'], default: 'medium' },
    isKnown:    { type: Boolean, default: false }
  }],
  totalCards:    { type: Number, default: 0 },
  masteredCards: { type: Number, default: 0 }
}, { timestamps: true });

flashcardSchema.index({ user: 1, createdAt: -1 });

const chatSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  docId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  docTitle: { type: String, default: '' },
  messages: [{
    role:      { type: String, enum: ['user','assistant'], required: true },
    content:   { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

chatSchema.index({ user: 1, updatedAt: -1 });

const planSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:      { type: String, required: true },
  examDate:   { type: Date },
  subjects:   [String],
  dailyHours: { type: Number, default: 6 },
  isActive:   { type: Boolean, default: true, index: true },
  tasks: [{
    day:       { type: String },
    subject:   { type: String },
    task:      { type: String },
    duration:  { type: Number, default: 60 },
    completed: { type: Boolean, default: false },
    priority:  { type: String, enum: ['low','medium','high'], default: 'medium' }
  }]
}, { timestamps: true });

planSchema.index({ user: 1, isActive: 1 });

module.exports = {
  User:      mongoose.model('User',      userSchema),
  Document:  mongoose.model('Document',  documentSchema),
  Flashcard: mongoose.model('Flashcard', flashcardSchema),
  Chat:      mongoose.model('Chat',      chatSchema),
  Plan:      mongoose.model('Plan',      planSchema)
};
