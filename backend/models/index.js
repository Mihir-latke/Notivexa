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
  studyStats:  { documentsUploaded:{type:Number,default:0}, notesGenerated:{type:Number,default:0}, flashcardsCreated:{type:Number,default:0} }
}, { timestamps: true });
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12); next();
});
userSchema.methods.comparePassword = function(p) { return bcrypt.compare(p, this.password); };
userSchema.methods.toJSON = function() { const o = this.toObject(); delete o.password; return o; };

const sectionSchema = new mongoose.Schema({ title:String, content:String, wordCount:{type:Number,default:0} });

const documentSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:         { type: String, required: true, trim: true },
  originalName:  { type: String },
  fileType:      { type: String, enum: ['pdf','image','youtube','url','video'], default: 'pdf' },
  size:          { type: Number, default: 0 },
  filePath:      { type: String, required: true },
  status:        { type: String, enum: ['processing','ready','error'], default: 'processing' },
  errorMessage:  { type: String, default: '' },
  extractedText: { type: String, default: '' },  // FULL text, never truncated
  sections:      [sectionSchema],
  pageCount:     { type: Number, default: 0 },
  wordCount:     { type: Number, default: 0 },
  subject:       { type: String, default: 'General' },
  outputs: [{
    type:     { type: String },
    language: { type: String, default: 'English' },
    fileName: { type: String },
    filePath: { type: String },
    fileSize: { type: Number, default: 0 },
    createdAt:{ type: Date, default: Date.now }
  }],
  imagePaths: [{ type: String }],  // Paths to images/diagrams extracted from PDF
  diagrams: [{
    page:     { type: Number, default: 1 },
    fileName: { type: String },
    base64:   { type: String }
  }]
}, { timestamps: true });

const flashcardSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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

const chatSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  docId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  docTitle: { type: String, default: '' },
  messages: [{ role:{type:String,enum:['user','assistant']}, content:String, timestamp:{type:Date,default:Date.now} }]
}, { timestamps: true });

const planSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:      { type: String, required: true },
  examDate:   { type: Date },
  subjects:   [String],
  dailyHours: { type: Number, default: 6 },
  isActive:   { type: Boolean, default: true },
  tasks: [{
    day:       String, subject:String, task:String,
    duration:  {type:Number,default:60},
    completed: {type:Boolean,default:false},
    priority:  {type:String,enum:['low','medium','high'],default:'medium'}
  }]
}, { timestamps: true });

module.exports = {
  User:      mongoose.model('User',      userSchema),
  Document:  mongoose.model('Document',  documentSchema),
  Flashcard: mongoose.model('Flashcard', flashcardSchema),
  Chat:      mongoose.model('Chat',      chatSchema),
  Plan:      mongoose.model('Plan',      planSchema)
};
