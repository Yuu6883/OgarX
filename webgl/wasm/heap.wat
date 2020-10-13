(module
  (type $t0 (func (param i32 i32 i32 i32)))
  (import "env" "m" (memory $env.m 0))
  (func $sort (type $t0) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32)
    (local $l4 i32) (local $l5 i32) (local $l6 i32) (local $l7 i32) (local $l8 i32) (local $l9 i32) (local $l10 i32) (local $l11 i32)
    block $B0
      local.get $p3
      i32.const 0
      i32.le_s
      br_if $B0
      loop $L1
        local.get $p2
        local.get $l4
        i32.const 2
        i32.shl
        i32.add
        local.get $l4
        i32.store
        local.get $l4
        i32.const 1
        i32.add
        local.tee $l4
        local.get $p3
        i32.ne
        br_if $L1
      end
      i32.const 1
      local.set $l8
      block $B2
        local.get $p3
        i32.const 1
        i32.le_s
        br_if $B2
        loop $L3
          local.get $p0
          local.get $p2
          local.get $l8
          i32.const 2
          i32.shl
          i32.add
          local.tee $l5
          i32.load
          local.tee $l6
          i32.const 28
          i32.mul
          i32.add
          f32.load offset=8
          local.get $p0
          local.get $p2
          local.get $l8
          i32.const -1
          i32.add
          i32.const 1
          i32.shr_u
          local.tee $l4
          i32.const 2
          i32.shl
          i32.add
          local.tee $l7
          i32.load
          local.tee $l9
          i32.const 28
          i32.mul
          i32.add
          f32.load offset=8
          f32.gt
          i32.const 1
          i32.xor
          i32.eqz
          if $I4
            loop $L5
              local.get $l5
              local.get $l9
              i32.store
              local.get $l7
              local.get $l6
              i32.store
              local.get $p0
              local.get $p2
              local.get $l4
              i32.const 2
              i32.shl
              i32.add
              local.tee $l5
              i32.load
              local.tee $l6
              i32.const 28
              i32.mul
              i32.add
              f32.load offset=8
              local.get $p0
              local.get $p2
              local.get $l4
              i32.const -1
              i32.add
              i32.const 2
              i32.div_s
              local.tee $l4
              i32.const 2
              i32.shl
              i32.add
              local.tee $l7
              i32.load
              local.tee $l9
              i32.const 28
              i32.mul
              i32.add
              f32.load offset=8
              f32.gt
              br_if $L5
            end
          end
          local.get $l8
          i32.const 1
          i32.add
          local.tee $l8
          local.get $p3
          i32.ne
          br_if $L3
        end
        local.get $p3
        i32.const 1
        i32.le_s
        br_if $B2
        local.get $p3
        local.set $l6
        loop $L6
          local.get $p2
          i32.load
          local.set $l4
          local.get $p2
          local.get $p2
          local.get $l6
          local.tee $l10
          i32.const -1
          i32.add
          local.tee $l6
          i32.const 2
          i32.shl
          i32.add
          local.tee $l5
          i32.load
          i32.store
          local.get $l5
          local.get $l4
          i32.store
          local.get $l10
          i32.const -2
          i32.add
          local.set $l11
          local.get $p2
          i32.load
          local.set $l7
          i32.const 0
          local.set $l4
          loop $L7
            local.get $p2
            local.get $l4
            local.tee $l9
            i32.const 1
            i32.shl
            i32.const 1
            i32.or
            local.tee $l4
            i32.const 1
            i32.add
            local.tee $l5
            local.get $l4
            local.get $p0
            local.get $p2
            local.get $l4
            i32.const 2
            i32.shl
            i32.add
            i32.load
            i32.const 28
            i32.mul
            i32.add
            f32.load offset=8
            local.get $p0
            local.get $p2
            local.get $l5
            i32.const 2
            i32.shl
            i32.add
            i32.load
            i32.const 28
            i32.mul
            i32.add
            f32.load offset=8
            f32.lt
            select
            local.get $l4
            local.get $l4
            local.get $l11
            i32.lt_s
            select
            local.tee $l4
            i32.const 2
            i32.shl
            i32.add
            local.tee $l8
            i32.load
            local.set $l5
            block $B8
              local.get $l4
              local.get $l6
              i32.ge_s
              if $I9
                local.get $l5
                local.set $l7
                br $B8
              end
              local.get $p0
              local.get $l7
              i32.const 28
              i32.mul
              i32.add
              f32.load offset=8
              local.get $p0
              local.get $l5
              i32.const 28
              i32.mul
              i32.add
              f32.load offset=8
              f32.lt
              i32.const 1
              i32.xor
              if $I10
                local.get $l5
                local.set $l7
                br $B8
              end
              local.get $p2
              local.get $l9
              i32.const 2
              i32.shl
              i32.add
              local.get $l5
              i32.store
              local.get $l8
              local.get $l7
              i32.store
            end
            local.get $l4
            local.get $l6
            i32.lt_s
            br_if $L7
          end
          local.get $l10
          i32.const 2
          i32.gt_s
          br_if $L6
        end
      end
      i32.const 0
      local.set $l4
      local.get $p3
      i32.const 0
      i32.le_s
      br_if $B0
      loop $L11
        local.get $p1
        local.get $l4
        i32.const 28
        i32.mul
        i32.add
        local.tee $l5
        local.get $p0
        local.get $p2
        local.get $l4
        i32.const 2
        i32.shl
        i32.add
        i32.load
        i32.const 28
        i32.mul
        i32.add
        local.tee $l6
        i64.load align=4
        i64.store align=4
        local.get $l5
        local.get $l6
        i32.load offset=24
        i32.store offset=24
        local.get $l5
        local.get $l6
        i64.load offset=16 align=4
        i64.store offset=16 align=4
        local.get $l5
        local.get $l6
        i64.load offset=8 align=4
        i64.store offset=8 align=4
        local.get $l4
        i32.const 1
        i32.add
        local.tee $l4
        local.get $p3
        i32.ne
        br_if $L11
      end
    end)
  (export "sort" (func $sort)))