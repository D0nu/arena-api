import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  topic: {
    type: String,
    enum: ['solana', 'music', 'sports', 'movies', 'history', 'fashion'],
    required: true
  },
  question: { 
    type: String, 
    required: true 
  },
  options: {
    type: [String],
    validate: {
      validator: function (arr) {
        return arr.length === 4;
      },
      message: 'Each question must have 4 options.'
    },
    required: true
  },
  correctAnswer: {
    type: Number,
    required: true,
    min: 0,
    max: 3
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  }
}, { timestamps: true });

export const Question = mongoose.model('Question', questionSchema);