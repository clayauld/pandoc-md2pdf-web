const request = require('supertest');
const express = require('express');

// Mock nanoid before requiring the app
jest.mock('nanoid', () => ({
  nanoid: () => 'mock-id'
}));

const app = require('./index');

describe('GET /download/:id/:filename', () => {
  it('should return 400 for invalid id/filename', async () => {
      const res = await request(app)
        .get('/download/invalid_id/..%2F..%2Ffile.pdf');

      expect(res.statusCode).toBe(400);
      expect(res.text).toBe('Invalid request');
  });

  it('should return 404 and File not found or not readable for non-existent file', async () => {
    const res = await request(app)
      .get('/download/1234567890/nonexistent.pdf');

    expect(res.statusCode).toBe(404);
    expect(res.text).toBe('File not found or not readable');
  });
});
