#!/usr/bin/env bash
# The Redis commands from "Redis Runs on One Thread", run in order. CI runs this inside the browser VM
# (Alpine, Redis 7.2) so the post's outputs are checked on the same machine readers use.
redis-cli PING >/dev/null 2>&1 || redis-server --daemonize yes --save '' --appendonly no --loglevel warning >/dev/null 2>&1
sleep 1

echo '$ strings'
redis-cli SET n 12345 >/dev/null
redis-cli SET s44 "$(head -c 44 /dev/zero | tr '\0' x)" >/dev/null
redis-cli SET s45 "$(head -c 45 /dev/zero | tr '\0' x)" >/dev/null
for k in n s44 s45; do echo "$k: $(redis-cli OBJECT ENCODING $k)"; done

echo '$ hash cliff'
for n in 512 513; do
  redis-cli DEL h >/dev/null
  seq $n | awk '{print "HSET h f"$1" v"$1}' | redis-cli >/dev/null
  echo "$n fields: $(redis-cli OBJECT ENCODING h), $(redis-cli MEMORY USAGE h) bytes"
done

echo '$ one-way conversion'
redis-cli SADD ids 1 2 3 >/dev/null; echo "ints only:     $(redis-cli OBJECT ENCODING ids)"
redis-cli SADD ids abc >/dev/null;   echo "add a string:  $(redis-cli OBJECT ENCODING ids)"
redis-cli SREM ids abc >/dev/null;   echo "remove it:     $(redis-cli OBJECT ENCODING ids)"

echo '$ lfu'
redis-cli CONFIG SET maxmemory-policy allkeys-lfu >/dev/null
redis-cli SET hot v >/dev/null
for n in 10 100 1000; do
  seq $n | awk '{print "GET hot"}' | redis-cli >/dev/null
  echo "after $n more GETs: counter $(redis-cli OBJECT FREQ hot)"
done
redis-cli CONFIG SET maxmemory-policy noeviction >/dev/null

echo '$ expiry backlog'
redis-cli FLUSHALL >/dev/null
redis-cli EVAL "for i=1,20000 do redis.call('SET','live:'..i,'v','EX',3600) end for i=1,2000 do redis.call('SET','dead:'..i,'v','PX',500) end return 'ok'" 0
sleep 10
echo "10 s later: $(redis-cli INFO stats | grep -o 'expired_keys:[0-9]*'), dbsize $(redis-cli DBSIZE)"
