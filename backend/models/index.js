const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:        { type:String, required:true, trim:true },
  email:       { type:String, required:true, unique:true, lowercase:true },
  password:    { type:String, required:true, minlength:6, select:false },
  role:        { type:String, enum:['student','teacher','admin'], default:'student' },
  institution: { type:String, default:'' },
  preferredLanguage: { type:String, default:'English' },
  theme:       { type:String, enum:['default','light','dark'], default:'default' },
  isActive:    { type:Boolean, default:true },
  studyStats:  {
    documentsUploaded: { type:Number, default:0 },
    notesGenerated:    { type:Number, default:0 },
    flashcardsCreated: { type:Number, default:0 },
    questionsGenerated:{ type:Number, default:0 }
  }
}, { timestamps:true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12); next();
});
userSchema.methods.comparePassword = function(p) { return bcrypt.compare(p, this.password); };
userSchema.methods.toJSON = function() { const o = this.toObject(); delete o.password; return o; };

// OUTPUT subdocument — use "kind" not "type" to avoid Mongoose reserved keyword conflict
const outputSchema = new mongoose.Schema({
  kind:      { type:String, default:'notes' },   // ← "kind" not "type"
  language:  { type:String, default:'English' },
  fileName:  { type:String, default:'' },
  filePath:  { type:String, default:'' },
  fileSize:  { type:Number, default:0 },
  createdAt: { type:Date, default:Date.now }
}, { _id:false });

const docSchema = new mongoose.Schema({
  user:          { type:mongoose.Schema.Types.ObjectId, ref:'User', required:true },
  title:         { type:String, required:true, trim:true },
  originalName:  { type:String },
  fileType:      { type:String, enum:['pdf','image'], default:'pdf' },
  size:          { type:Number, default:0 },
  filePath:      { type:String, required:true },
  status:        { type:String, enum:['processing','ready','error'], default:'processing' },
  errorMessage:  { type:String, default:'' },
  extractedText: { type:String, default:'' },
  imageAnalysis: { type:String, default:'' },
  sections:      [{ title:String, content:String, wordCount:{type:Number,default:0} }],
  pageCount:     { type:Number, default:0 },
  wordCount:     { type:Number, default:0 },
  subject:       { type:String, default:'General' },
  tags:          [String],
  outputs:       [outputSchema]
}, { timestamps:true });

const flashcardSchema = new mongoose.Schema({
  user:          { type:mongoose.Schema.Types.ObjectId, ref:'User', required:true },
  documentId:    { type:mongoose.Schema.Types.ObjectId, ref:'Document' },
  documentTitle: { type:String, default:'' },
  title:         { type:String, required:true },
  subject:       { type:String, default:'General' },
  language:      { type:String, default:'English' },
  cards: [{
    question:    { type:String },
    answer:      { type:String },
    hint:        { type:String, default:'' },
    difficulty:  { type:String, enum:['easy','medium','hard'], default:'medium' },
    bloomsLevel: { type:String, default:'remember' },
    isKnown:     { type:Boolean, default:false },
    reviewCount: { type:Number, default:0 }
  }],
  totalCards:    { type:Number, default:0 },
  masteredCards: { type:Number, default:0 }
}, { timestamps:true });

const chatSchema = new mongoose.Schema({
  user:     { type:mongoose.Schema.Types.ObjectId, ref:'User', required:true },
  docId:    { type:mongoose.Schema.Types.ObjectId, ref:'Document' },
  docTitle: { type:String, default:'General Chat' },
  title:    { type:String, default:'New Chat' },
  messages: [{
    role:      { type:String, enum:['user','assistant'] },
    content:   { type:String },
    timestamp: { type:Date, default:Date.now }
  }]
}, { timestamps:true });

const planSchema = new mongoose.Schema({
  user:       { type:mongoose.Schema.Types.ObjectId, ref:'User', required:true },
  title:      { type:String, required:true },
  examDate:   { type:Date },
  subjects:   [String],
  syllabus:   { type:String, default:'' },
  dailyHours: { type:Number, default:6 },
  isActive:   { type:Boolean, default:true },
  tasks: [{
    day:               { type:String },
    date:              { type:Date },
    subject:           { type:String },
    topic:             { type:String },
    task:              { type:String },
    duration:          { type:Number, default:60 },
    completed:         { type:Boolean, default:false },
    priority:          { type:String, enum:['low','medium','high'], default:'medium' },
    importantQuestions:[String]
  }]
}, { timestamps:true });

const performanceSchema = new mongoose.Schema({
  user:      { type:mongoose.Schema.Types.ObjectId, ref:'User', required:true },
  subject:   { type:String },
  score:     { type:Number },
  totalQ:    { type:Number },
  correct:   { type:Number },
  date:      { type:Date, default:Date.now },
  sessionType:{ type:String, default:'flashcard' }
}, { timestamps:true });

module.exports = {
  User:        mongoose.model('User',        userSchema),
  Document:    mongoose.model('Document',    docSchema),
  Flashcard:   mongoose.model('Flashcard',   flashcardSchema),
  Chat:        mongoose.model('Chat',        chatSchema),
  Plan:        mongoose.model('Plan',        planSchema),
  Performance: mongoose.model('Performance', performanceSchema)
};
