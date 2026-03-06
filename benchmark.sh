#!/bin/bash
# Start server in background
cd server
npm start > /dev/null 2>&1 &
SERVER_PID=$!

echo "Waiting for server to start..."
until curl -s -f http://localhost:8080/healthz > /dev/null; do sleep 1; done

# Create some test files with more content to make pandoc work harder
mkdir -p test_files
for i in {1..10}; do
  echo "# Test File $i" > test_files/test$i.md
  for j in {1..1000}; do
    echo "This is paragraph $j of test document $i. Adding more content to make pandoc work harder and increase processing time." >> test_files/test$i.md
  done
done

# Run benchmark
echo "Running benchmark..."
time curl -s -X POST \
  -F "files=@test_files/test1.md" \
  -F "files=@test_files/test2.md" \
  -F "files=@test_files/test3.md" \
  -F "files=@test_files/test4.md" \
  -F "files=@test_files/test5.md" \
  -F "files=@test_files/test6.md" \
  -F "files=@test_files/test7.md" \
  -F "files=@test_files/test8.md" \
  -F "files=@test_files/test9.md" \
  -F "files=@test_files/test10.md" \
  http://localhost:8080/convert > /dev/null

# Clean up
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
rm -rf test_files
