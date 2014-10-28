#!perl -w
use Net::WebSocket::Server;

my @conns;
 
Net::WebSocket::Server->new(
    listen => 3000,
    on_connect => sub {
        my ($serv, $conn) = @_;
        push @conns, $conn;
        $conn->on(
            utf8 => sub {
                my ($conn, $msg) = @_;
                #print "$msg\n";
                for my $c (@conns) {
                    eval {
                        $c->send_utf8($msg);
                    };
                }
                #$conn->send_utf8($msg);
            },
        );
    },
)->start;
